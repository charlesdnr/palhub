import { Injectable, inject } from '@angular/core';
import type { Pal, PalboxSnapshot } from '@palhub/shared';
import { ServersService } from './servers.service';

export const CDN =
  'https://cdn.paldb.cc/image/Pal/Texture/PalIcon/Normal/T_{}_icon_normal.webp';
export const BASE = '__base__';
export const ALL = '__all__';

export const ivTotal = (p: Pal): number => p.ivs.hp + p.ivs.shot + p.ivs.defense;
export const keyOf = (p: Pal): string => (p.owner === null ? BASE : p.owner);
export const portraitUrl = (speciesId: string): string =>
  CDN.replace('{}', speciesId);
export const rankIcon = (r: number): string =>
  `url('/game-assets/icons/rank_0${Math.min(Math.abs(r) || 1, 5)}.webp')`;

/** Données palbox d'un serveur + préférences locales (« c'est moi », boîte de breeding). */
@Injectable({ providedIn: 'root' })
export class PalboxDataService {
  private readonly servers = inject(ServersService);
  private cache = new Map<string, Promise<PalboxSnapshot | null>>();
  // uid -> nom, mémoïsé par snapshot (évite un players.find par pal affiché).
  private readonly nameCache = new WeakMap<PalboxSnapshot, Map<string, string>>();

  load(slug: string): Promise<PalboxSnapshot | null> {
    if (!this.cache.has(slug)) {
      const p = this.servers.getPalbox(slug);
      // ne pas mémoriser un échec : un retour ultérieur doit pouvoir réessayer
      void p.catch(() => this.cache.delete(slug));
      this.cache.set(slug, p);
    }
    return this.cache.get(slug)!;
  }

  palsOf(data: PalboxSnapshot, key: string): Pal[] {
    return key === ALL ? data.pals : data.pals.filter((p) => keyOf(p) === key);
  }

  /** Table uid -> nom du snapshot (construite une fois, mémoïsée). */
  namesOf(data: PalboxSnapshot): Map<string, string> {
    let m = this.nameCache.get(data);
    if (!m) {
      m = new Map(data.players.map((p) => [p.uid, p.name]));
      this.nameCache.set(data, m);
    }
    return m;
  }

  nameOf(data: PalboxSnapshot, key: string): string {
    if (key === ALL) return 'Tous les pals';
    if (key === BASE) return 'Base';
    return this.namesOf(data).get(key) ?? key;
  }

  ownerName(data: PalboxSnapshot, p: Pal): string {
    return (p.owner && this.namesOf(data).get(p.owner)) || 'Base';
  }

  me(slug: string): string {
    return localStorage.getItem(`palbox.me:${slug}`) ?? '';
  }

  setMe(slug: string, uid: string): void {
    localStorage.setItem(`palbox.me:${slug}`, uid);
  }

  breedBox(slug: string): string | null {
    return localStorage.getItem(`palbox.breedbox:${slug}`);
  }

  setBreedBox(slug: string, key: string): void {
    localStorage.setItem(`palbox.breedbox:${slug}`, key);
  }
}
