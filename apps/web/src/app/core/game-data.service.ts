import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Point [x, y] ou [x, y, label] ou [x, y, label, niveau, cléPal] (monde Unreal, cm). */
export type MarkerPoint = [number, number, string?, number?, string?];

export interface MapLayerDef {
  key: string;
  label: string;
  icon?: string;
  size?: number;
  n?: number;
  /** couche « nuage de spawns » d'une espèce */
  pal?: boolean;
  /** couche serveur (bases/joueurs) */
  srv?: boolean;
}

export interface MapGroupDef {
  key: string;
  label: string;
  layers: MapLayerDef[];
}

export interface MapData {
  groups: MapGroupDef[];
  markers: Record<string, Record<'main' | 'tree', MarkerPoint[]>>;
}

export interface MapPals {
  pals: { key: string; name: string; n: number }[];
  points: Record<string, Record<'main' | 'tree', [number, number][]>>;
}

/** Charge (et met en cache) les grosses données statiques du jeu. */
@Injectable({ providedIn: 'root' })
export class GameDataService {
  private readonly http = inject(HttpClient);
  private mapData?: Promise<MapData>;
  private mapPals?: Promise<MapPals>;

  getMapData(): Promise<MapData> {
    this.mapData ??= firstValueFrom(
      this.http.get<MapData>('/game-assets/data/map-objects.json'),
    );
    return this.mapData;
  }

  getMapPals(): Promise<MapPals> {
    this.mapPals ??= firstValueFrom(
      this.http.get<MapPals>('/game-assets/data/map-pals.json'),
    );
    return this.mapPals;
  }
}
