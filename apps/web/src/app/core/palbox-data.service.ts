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

  load(slug: string): Promise<PalboxSnapshot | null> {
    if (!this.cache.has(slug)) {
      this.cache.set(slug, this.servers.getPalbox(slug));
    }
    return this.cache.get(slug)!;
  }

  palsOf(data: PalboxSnapshot, key: string): Pal[] {
    return key === ALL ? data.pals : data.pals.filter((p) => keyOf(p) === key);
  }

  nameOf(data: PalboxSnapshot, key: string): string {
    if (key === ALL) return 'Tous les pals';
    if (key === BASE) return 'Base';
    return data.players.find((x) => x.uid === key)?.name ?? key;
  }

  ownerName(data: PalboxSnapshot, p: Pal): string {
    return data.players.find((x) => x.uid === p.owner)?.name ?? 'Base';
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
