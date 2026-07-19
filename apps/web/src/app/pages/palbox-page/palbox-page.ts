import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { Pal, PalboxSnapshot } from '@palhub/shared';
import {
  ALL,
  BASE,
  PalboxDataService,
  ivTotal,
} from '../../core/palbox-data.service';
import { BreedingService } from '../../core/breeding.service';
import { PalPortrait } from '../../shared/pal-portrait';

interface RosterEntry {
  key: string;
  name: string;
  level: number;
  pals: Pal[];
  best: Pal | null;
  uniq: number;
  alphas: number;
  share: number;
}

/** Accueil du palbox : le dex du serveur + classement des joueurs + portes. */
@Component({
  selector: 'app-palbox-page',
  imports: [PalPortrait, FormsModule],
  templateUrl: './palbox-page.html',
  styleUrl: './palbox-page.scss',
})
export class PalboxPage {
  private readonly dataSvc = inject(PalboxDataService);
  private readonly breeding = inject(BreedingService);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();

  protected readonly data = signal<PalboxSnapshot | null | undefined>(undefined);
  protected readonly loadError = signal(false);
  protected readonly hasBreeding = signal(false);
  protected readonly meUid = signal('');
  protected hunt = '';

  protected readonly ALL = ALL;
  protected readonly BASE = BASE;

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.reload(slug);
    });
    void this.breeding.load().then((d) => this.hasBreeding.set(!!d));
  }

  protected reload(slug = this.slug()): void {
    this.data.set(undefined);
    this.loadError.set(false);
    this.meUid.set(this.dataSvc.me(slug));
    void this.dataSvc.load(slug).then(
      (d) => this.data.set(d),
      () => this.loadError.set(true),
    );
  }

  protected readonly stats = computed(() => {
    const d = this.data();
    if (!d) return null;
    return {
      pals: d.pals.length,
      species: new Set(d.pals.map((p) => p.species)).size,
      alphas: d.pals.filter((p) => p.alpha).length,
      lucky: d.pals.filter((p) => p.lucky).length,
      basePals: d.pals.filter((p) => p.owner === null).length,
      players: d.players.length,
    };
  });

  protected readonly roster = computed<RosterEntry[]>(() => {
    const d = this.data();
    if (!d) return [];
    const entries = d.players
      .map((pl) => {
        const pals = this.dataSvc.palsOf(d, pl.uid);
        return {
          key: pl.uid,
          name: pl.name,
          level: pl.level,
          pals,
          best:
            pals
              .slice()
              .sort((a, b) => b.level - a.level || ivTotal(b) - ivTotal(a))[0] ?? null,
          uniq: new Set(pals.map((p) => p.species)).size,
          alphas: pals.filter((p) => p.alpha).length,
          share: 0,
        };
      })
      .sort((a, b) => b.pals.length - a.pals.length);
    const top = entries.length ? entries[0].pals.length : 1;
    for (const e of entries) {
      e.share = Math.round((100 * e.pals.length) / Math.max(top, 1));
    }
    return entries;
  });

  protected readonly stamp = computed(() => {
    const d = this.data();
    if (!d) return null;
    const date = new Date(d.generated_at);
    const hours = (Date.now() - date.getTime()) / 36e5;
    return {
      text:
        'données du ' +
        date.toLocaleString('fr', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
      staleDays: hours > 24 ? Math.floor(hours / 24) : 0,
      world: d.world_id,
    };
  });

  protected fr(n: number): string {
    return n.toLocaleString('fr');
  }

  protected open(key: string): void {
    void this.router.navigate(['/s', this.slug(), 'palbox', 'p', key]);
  }

  protected openBreeding(): void {
    void this.router.navigate(['/s', this.slug(), 'breeding']);
  }

  protected setMe(event: Event, uid: string): void {
    event.stopPropagation();
    this.dataSvc.setMe(this.slug(), uid);
    this.meUid.set(uid);
  }

  protected jump(): void {
    const v = this.hunt.trim();
    if (!v) return;
    this.hunt = '';
    void this.router.navigate(['/s', this.slug(), 'palbox', 'p', ALL], {
      queryParams: { q: v },
    });
  }
}
