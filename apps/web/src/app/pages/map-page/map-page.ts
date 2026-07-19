import {
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import type { LiveSnapshot } from '@palhub/shared';
import {
  GameDataService,
  MapData,
  MapGroupDef,
  MapLayerDef,
  MapPals,
  MarkerPoint,
} from '../../core/game-data.service';
import { ServersService } from '../../core/servers.service';

/* Trois repères coexistent (voir l'ancien site/map.js) :
 *  - monde Unreal (cm), celui des .sav et de map-objects.json ;
 *  - pixels des textures 8192×8192 (tuiles /game-assets/map-tiles/) ;
 *  - coordonnées affichées en jeu (la boussole). */
const MAP_SIZE = 8192;
const NATIVE_ZOOM = 5; // 8192 / 256 = 2^5
const GAME_TX = 123930;
const GAME_TY = 157935;
const GAME_SCALE = 459;
const PAL_CDN =
  'https://cdn.paldb.cc/image/Pal/Texture/PalIcon/Normal/T_{}_icon_normal.webp';

type AreaKey = 'main' | 'tree';

const AREAS: Record<
  AreaKey,
  { label: string; tiles: string; min: { x: number; y: number }; max: { x: number; y: number } }
> = {
  main: {
    label: 'Îles Palpagos',
    tiles: '/game-assets/map-tiles/main/{z}/{x}/{y}.webp',
    min: { x: -1099400, y: -724400 },
    max: { x: 349400, y: 724400 },
  },
  tree: {
    label: 'Arbre-Monde',
    tiles: '/game-assets/map-tiles/tree/{z}/{x}/{y}.webp',
    min: { x: 347351.5, y: -818197 },
    max: { x: 689148.5, y: -476400 },
  },
};

const DEFAULT_LAYERS = ['fastTravel', 'bosses', 'srvBases'];
const STORAGE_KEY = 'palhub.map.layers';

interface RichPoint {
  x: number;
  y: number;
  tip?: string;
  pop?: string;
  cls?: string;
}

@Component({
  selector: 'app-map-page',
  imports: [FormsModule],
  templateUrl: './map-page.html',
  styleUrl: './map-page.scss',
})
export class MapPage {
  private readonly gameData = inject(GameDataService);
  private readonly servers = inject(ServersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly slug = input.required<string>();

  protected readonly groups = signal<MapGroupDef[]>([]);
  protected readonly search = signal('');
  protected readonly openGroups = signal<Set<string>>(new Set(['serveur', 'lieux']));
  protected readonly enabledSig = signal<Set<string>>(new Set(DEFAULT_LAYERS));
  protected readonly area = signal<AreaKey>('main');
  protected readonly sideOpen = signal(false);
  protected readonly coords = signal('—');
  protected readonly areaLabels = Object.entries(AREAS).map(([key, a]) => ({
    key: key as AreaKey,
    label: a.label,
  }));

  /** Groupes filtrés par la recherche (les groupes filtrés s'affichent dépliés). */
  protected readonly visibleGroups = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.groups();
    return this.groups()
      .map((g) => ({
        ...g,
        layers: g.layers.filter((l) => l.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.layers.length > 0);
  });

  private map?: L.Map;
  private tileLayer?: L.TileLayer;
  private data?: MapData;
  private pals?: MapPals;
  private live: LiveSnapshot | null = null;
  private readonly groupCache = new Map<string, L.LayerGroup & { _scale?: number }>();
  private readonly layerDefs = new Map<string, MapLayerDef>();
  private readonly dotCanvas = L.canvas({ padding: 0.4 });

  constructor() {
    afterNextRender(() => void this.init());
    this.destroyRef.onDestroy(() => this.map?.remove());
    // toute modification de couches/carte est répercutée sur Leaflet
    effect(() => {
      this.enabledSig();
      this.area();
      if (this.map) {
        this.applyEnabled();
        this.persistLayers();
      }
    });
  }

  private async init(): Promise<void> {
    const [data, live] = await Promise.all([
      this.gameData.getMapData(),
      this.servers.getLive(this.slug()),
    ]);
    this.data = data;
    this.live = live;

    this.buildServerLayers();
    this.injectGroups();
    this.restoreLayers();

    const map = L.map('palhub-map', {
      crs: L.CRS.Simple,
      minZoom: 1,
      maxZoom: 7, // 5..7 = zoom numérique, net de près
      zoomSnap: 0.25,
      zoomControl: false,
      attributionControl: true,
    });
    this.map = map;
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(
      'Palworld © Pocketpair · données paldb.cc & palworld-save-pal',
    );
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('zoomend', () => this.applyEnabled());
    map.on('moveend zoomend', () => this.writeHash());
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const g = this.latLngToGame(e.latlng);
      this.coords.set(`${g.x}, ${g.y}`);
    });

    const fromHash = this.parseHash();
    this.area.set(fromHash.area);
    this.setArea(fromHash.area, fromHash.view);
  }

  /* ---------- données / couches ---------- */

  /** Ajoute les groupes synthétiques Serveur + Pals aux groupes du jeu. */
  private injectGroups(): void {
    const data = this.data!;
    const groups: MapGroupDef[] = [
      {
        key: 'serveur',
        label: 'Serveur',
        layers: [
          { key: 'srvBases', label: 'Bases', icon: 't_icon_compass_camp.webp', size: 26, srv: true },
          { key: 'srvPlayers', label: 'Joueurs', size: 24, srv: true },
        ],
      },
      ...data.groups,
    ];
    for (const g of groups) for (const l of g.layers) this.layerDefs.set(l.key, l);
    this.groups.set(groups);

    // le groupe « Pals » (259 couches) est chargé en tâche de fond
    void this.gameData.getMapPals().then((pals) => {
      this.pals = pals;
      const palGroup: MapGroupDef = {
        key: 'pals',
        label: 'Pals',
        layers: pals.pals.map((p) => ({
          key: 'pal:' + p.key,
          label: p.name,
          icon: PAL_CDN.replace('{}', p.key),
          size: 22,
          pal: true,
          n: p.n,
        })),
      };
      const current = [...this.groups()];
      current.splice(2, 0, palGroup); // après Serveur et Lieux
      for (const l of palGroup.layers) this.layerDefs.set(l.key, l);
      this.groups.set(current);
    });
  }

  /** Convertit le payload live en marqueurs enrichis {x, y, tip, pop}. */
  private buildServerLayers(): void {
    const data = this.data!;
    const bases: Record<AreaKey, RichPoint[]> = { main: [], tree: [] };
    const players: Record<AreaKey, RichPoint[]> = { main: [], tree: [] };
    for (const b of this.live?.bases ?? []) {
      const a = this.areaOf(b.x, b.y);
      if (!a) continue;
      const who = b.guild ? ` — ${b.guild}` : '';
      bases[a].push({ x: b.x, y: b.y, tip: `Base${who}`, pop: `<b>Base</b>${who}` });
    }
    for (const p of this.live?.players ?? []) {
      if (p.x == null || p.y == null) continue;
      const a = this.areaOf(p.x, p.y);
      if (!a) continue;
      const status = p.online ? 'en ligne' : 'hors ligne';
      players[a].push({
        x: p.x,
        y: p.y,
        cls: 'mk--player',
        tip: `${p.name} <span class="lvl">niv. ${p.level}</span>`,
        pop: `<b>${p.name}</b> — niv. ${p.level} (${status})`,
      });
    }
    data.markers['srvBases'] = bases as unknown as MapData['markers'][string];
    data.markers['srvPlayers'] = players as unknown as MapData['markers'][string];
  }

  private areaOf(wx: number, wy: number): AreaKey | null {
    for (const a of ['tree', 'main'] as const) {
      const { min, max } = AREAS[a];
      if (wx >= min.x && wx <= max.x && wy >= min.y && wy <= max.y) return a;
    }
    return null;
  }

  /* ---------- projection ---------- */

  private cmPerPx(): number {
    const a = AREAS[this.area()];
    return (a.max.x - a.min.x) / MAP_SIZE;
  }

  private worldToLatLng(wx: number, wy: number): L.LatLng {
    const a = AREAS[this.area()];
    const cm = this.cmPerPx();
    return this.map!.unproject(
      [(wy - a.min.y) / cm, MAP_SIZE - (wx - a.min.x) / cm],
      NATIVE_ZOOM,
    );
  }

  private latLngToGame(latlng: L.LatLng): { x: number; y: number } {
    const a = AREAS[this.area()];
    const cm = this.cmPerPx();
    const p = this.map!.project(latlng, NATIVE_ZOOM);
    const wx = (MAP_SIZE - p.y) * cm + a.min.x;
    const wy = p.x * cm + a.min.y;
    return {
      x: Math.round((wy - GAME_TY) / GAME_SCALE),
      y: Math.round((wx + GAME_TX) / GAME_SCALE),
    };
  }

  private gameToLatLng(gx: number, gy: number): L.LatLng {
    return this.worldToLatLng(gy * GAME_SCALE - GAME_TX, gx * GAME_SCALE + GAME_TY);
  }

  /* ---------- construction des marqueurs ---------- */

  /** De près, taille native ; en dézoomant les icônes grossissent (max ×1,8). */
  private iconScale(): number {
    const zq = Math.round(this.map!.getZoom() * 2) / 2;
    return zq >= 4 ? 1 : Math.min(1.8, 1 + 0.35 * (4 - zq));
  }

  private pointsOf(key: string, areaKey: AreaKey): (MarkerPoint | RichPoint)[] {
    if (key.startsWith('pal:')) {
      return (this.pals?.points[key.slice(4)] ?? {})[areaKey] ?? [];
    }
    return (this.data?.markers[key] ?? ({} as Record<string, MarkerPoint[]>))[areaKey] ?? [];
  }

  private buildGroup(key: string, areaKey: AreaKey): L.LayerGroup & { _scale?: number } {
    const def = this.layerDefs.get(key)!;
    const pts = this.pointsOf(key, areaKey);
    const group: L.LayerGroup & { _scale?: number } = L.layerGroup();
    const scale = this.iconScale();
    group._scale = scale;

    if (def.pal) {
      const color = dotColor(key);
      for (const pt of pts as [number, number][]) {
        group.addLayer(
          L.circleMarker(this.worldToLatLng(pt[0], pt[1]), {
            renderer: this.dotCanvas,
            radius: 4.5 * scale,
            color: '#060F19',
            weight: 1,
            fillColor: color,
            fillOpacity: 0.85,
          }).bindTooltip(def.label, { direction: 'top' }),
        );
      }
      return group;
    }

    const size = Math.round((def.size ?? 22) * scale);
    const iconFor = (url: string, cls: string) =>
      L.icon({
        iconUrl: url,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        tooltipAnchor: [0, -size / 2],
        popupAnchor: [0, -size / 2],
        className: cls ? `mk ${cls}` : 'mk',
      });
    const baseIcon = def.icon
      ? iconFor(`/game-assets/map-icons/${def.icon}`, '')
      : null;

    for (const m of pts) {
      if (!Array.isArray(m)) {
        // marqueur enrichi (couches serveur)
        const rich = m;
        const icon = def.icon
          ? iconFor(`/game-assets/map-icons/${def.icon}`, rich.cls ?? '')
          : null;
        const ll = this.worldToLatLng(rich.x, rich.y);
        const mk = icon
          ? L.marker(ll, { icon })
          : L.circleMarker(ll, {
              radius: 7,
              color: '#0b141d',
              weight: 2,
              fillColor: rich.cls === 'mk--player' ? '#f2a03d' : '#3fd0e0',
              fillOpacity: 0.95,
            });
        if (rich.tip) mk.bindTooltip(rich.tip, { direction: 'top' });
        const gc = this.latLngToGame(ll);
        mk.bindPopup(
          `${rich.pop ?? rich.tip ?? def.label}<br><span class="mono">${gc.x}, ${gc.y}</span>`,
        );
        group.addLayer(mk);
        continue;
      }

      const [x, y, label, lv, palKey] = m;
      let icon = baseIcon;
      if (key === 'bosses' && palKey) {
        icon = iconFor(PAL_CDN.replace('{}', palKey), 'mk--pal');
      }
      const ll = this.worldToLatLng(x, y);
      const mk = icon
        ? L.marker(ll, { icon })
        : L.circleMarker(ll, { radius: 5 });
      if (label || lv) {
        const txt = (label ?? def.label) + (lv ? ` <span class="lvl">niv. ${lv}</span>` : '');
        mk.bindTooltip(txt, { direction: 'top' });
        const g = this.latLngToGame(ll);
        mk.bindPopup(
          `<b>${label ?? def.label}</b>${lv ? ` — niv. ${lv}` : ''}<br><span class="mono">${g.x}, ${g.y}</span>`,
        );
      } else {
        mk.bindTooltip(def.label, { direction: 'top' });
      }
      group.addLayer(mk);
    }
    return group;
  }

  private getGroup(key: string, areaKey: AreaKey): L.LayerGroup {
    const id = `${key}|${areaKey}`;
    const cached = this.groupCache.get(id);
    if (cached && cached._scale !== this.iconScale()) {
      if (this.map!.hasLayer(cached)) this.map!.removeLayer(cached);
      this.groupCache.delete(id);
    }
    if (!this.groupCache.has(id)) {
      this.groupCache.set(id, this.buildGroup(key, areaKey));
    }
    return this.groupCache.get(id)!;
  }

  private applyEnabled(): void {
    if (!this.map) return;
    const area = this.area();
    const enabled = this.enabledSig();
    for (const key of this.layerDefs.keys()) {
      const cached = this.groupCache.get(`${key}|${area}`);
      if (enabled.has(key)) {
        this.getGroup(key, area).addTo(this.map);
      } else if (cached) {
        this.map.removeLayer(cached);
      }
    }
  }

  /* ---------- carte / navigation ---------- */

  protected setArea(next: AreaKey, view?: { z: number; x: number; y: number } | null): void {
    const map = this.map!;
    for (const key of this.layerDefs.keys()) {
      const g = this.groupCache.get(`${key}|${this.area()}`);
      if (g) map.removeLayer(g);
    }
    this.area.set(next);
    if (this.tileLayer) map.removeLayer(this.tileLayer);
    const bounds = L.latLngBounds(
      map.unproject([0, 0], NATIVE_ZOOM),
      map.unproject([MAP_SIZE, MAP_SIZE], NATIVE_ZOOM),
    );
    this.tileLayer = L.tileLayer(AREAS[next].tiles, {
      minZoom: 1,
      maxZoom: 7,
      maxNativeZoom: NATIVE_ZOOM,
      bounds,
      noWrap: true,
    }).addTo(map);
    map.setMaxBounds(bounds.pad(0.05));
    map.setMinZoom(1);
    map.setMinZoom(map.getBoundsZoom(bounds));
    if (view) {
      map.setView(this.gameToLatLng(view.x, view.y), view.z);
    } else {
      map.fitBounds(bounds);
    }
    this.applyEnabled();
  }

  /** L'URL porte la vue : #main/zoom/x,y (coordonnées du jeu, partageable). */
  private parseHash(): { area: AreaKey; view: { z: number; x: number; y: number } | null } {
    const m = location.hash.match(/^#(main|tree)\/(\d+(?:\.\d+)?)\/(-?\d+),(-?\d+)$/);
    if (m) {
      return {
        area: m[1] as AreaKey,
        view: { z: Number(m[2]), x: Number(m[3]), y: Number(m[4]) },
      };
    }
    return { area: 'main', view: null };
  }

  private writeHash(): void {
    if (!this.map) return;
    const g = this.latLngToGame(this.map.getCenter());
    const z = Math.round(this.map.getZoom() * 100) / 100;
    history.replaceState(null, '', `#${this.area()}/${z}/${g.x},${g.y}`);
  }

  /* ---------- sidebar ---------- */

  protected toggleGroup(key: string): void {
    const open = new Set(this.openGroups());
    if (open.has(key)) {
      open.delete(key);
    } else {
      open.add(key);
    }
    this.openGroups.set(open);
  }

  protected isOpen(key: string): boolean {
    return this.search().trim() !== '' || this.openGroups().has(key);
  }

  protected toggleLayer(key: string): void {
    const enabled = new Set(this.enabledSig());
    if (enabled.has(key)) {
      enabled.delete(key);
    } else {
      enabled.add(key);
    }
    this.enabledSig.set(enabled);
  }

  protected enabledCount(group: MapGroupDef): number {
    const enabled = this.enabledSig();
    return group.layers.reduce((n, l) => n + (enabled.has(l.key) ? 1 : 0), 0);
  }

  /** « tout » : active toutes les couches du groupe, ou les coupe si déjà toutes actives. */
  protected toggleAll(event: Event, group: MapGroupDef): void {
    event.stopPropagation();
    const enabled = new Set(this.enabledSig());
    const allOn = group.layers.every((l) => enabled.has(l.key));
    for (const l of group.layers) {
      if (allOn) {
        enabled.delete(l.key);
      } else {
        enabled.add(l.key);
      }
    }
    this.enabledSig.set(enabled);
  }

  private persistLayers(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.enabledSig()]));
    } catch {
      /* stockage indisponible : tant pis */
    }
  }

  private restoreLayers(): void {
    const preset = new URLSearchParams(location.search).get('on');
    if (preset !== null) {
      this.enabledSig.set(new Set(preset.split(',').map((s) => s.trim()).filter(Boolean)));
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
      if (Array.isArray(saved)) this.enabledSig.set(new Set(saved));
    } catch {
      /* premier passage : défauts */
    }
  }
}

/* nuages d'habitat : une couleur stable par espèce */
const DOT_COLORS = ['#3FD0E0', '#F2A03D', '#C4505E', '#6FCF6F', '#B57BE6',
                    '#5A8DEE', '#F26D9D', '#8AD94F', '#F2D43D', '#E8EFF5'];

function dotColor(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return DOT_COLORS[Math.abs(h) % DOT_COLORS.length];
}
