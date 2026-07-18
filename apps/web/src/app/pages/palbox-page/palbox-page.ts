import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Pal, PalboxSnapshot } from '@palhub/shared';
import { ServersService } from '../../core/servers.service';

const PAL_CDN =
  'https://cdn.paldb.cc/image/Pal/Texture/PalIcon/Normal/T_{}_icon_normal.webp';

type SortKey = 'level' | 'species' | 'ivs' | 'rank';

@Component({
  selector: 'app-palbox-page',
  imports: [FormsModule, DatePipe],
  templateUrl: './palbox-page.html',
  styleUrl: './palbox-page.scss',
})
export class PalboxPage {
  private readonly servers = inject(ServersService);

  readonly slug = input.required<string>();

  protected readonly snapshot = signal<PalboxSnapshot | null | undefined>(undefined);

  // filtres
  protected readonly q = signal('');
  protected readonly owner = signal('all');
  protected readonly passive = signal('all');
  protected readonly luckyOnly = signal(false);
  protected readonly alphaOnly = signal(false);
  protected readonly minIv = signal(0);
  protected readonly sortBy = signal<SortKey>('level');
  protected readonly sortDesc = signal(true);

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.snapshot.set(undefined);
      void this.servers.getPalbox(slug).then((s) => this.snapshot.set(s));
    });
  }

  protected readonly owners = computed(() => {
    const snap = this.snapshot();
    if (!snap) return [];
    return snap.players.map((p) => ({ uid: p.uid, name: p.name }));
  });

  protected readonly passives = computed(() => {
    const snap = this.snapshot();
    if (!snap) return [];
    return Object.keys(snap.passive_ranks).sort((a, b) => a.localeCompare(b, 'fr'));
  });

  protected readonly filtered = computed(() => {
    const snap = this.snapshot();
    if (!snap) return [];
    const q = this.q().trim().toLowerCase();
    const owner = this.owner();
    const passive = this.passive();
    const lucky = this.luckyOnly();
    const alpha = this.alphaOnly();
    const minIv = this.minIv();

    let pals = snap.pals.filter((p) => {
      if (q && !p.species.toLowerCase().includes(q) && !(p.nickname ?? '').toLowerCase().includes(q)) return false;
      if (owner === 'base' && p.owner !== null) return false;
      if (owner !== 'all' && owner !== 'base' && p.owner !== owner) return false;
      if (passive !== 'all' && !p.passives.includes(passive)) return false;
      if (lucky && !p.lucky) return false;
      if (alpha && !p.alpha) return false;
      if (minIv > 0 && Math.min(p.ivs.hp, p.ivs.shot, p.ivs.defense) < minIv) return false;
      return true;
    });

    const key = this.sortBy();
    const dir = this.sortDesc() ? -1 : 1;
    pals = [...pals].sort((a, b) => dir * compare(a, b, key));
    return pals;
  });

  protected setSort(key: SortKey): void {
    if (this.sortBy() === key) {
      this.sortDesc.update((d) => !d);
    } else {
      this.sortBy.set(key);
      this.sortDesc.set(true);
    }
  }

  protected ownerName(uid: string | null): string {
    if (uid === null) return 'Base';
    return this.owners().find((o) => o.uid === uid)?.name ?? uid;
  }

  protected face(p: Pal): string {
    return PAL_CDN.replace('{}', p.species_id);
  }

  protected ivSum(p: Pal): number {
    return p.ivs.hp + p.ivs.shot + p.ivs.defense;
  }

  protected passiveRank(name: string): number {
    return this.snapshot()?.passive_ranks[name] ?? 0;
  }
}

function compare(a: Pal, b: Pal, key: SortKey): number {
  switch (key) {
    case 'level':
      return a.level - b.level;
    case 'rank':
      return a.rank - b.rank;
    case 'ivs':
      return (
        a.ivs.hp + a.ivs.shot + a.ivs.defense - (b.ivs.hp + b.ivs.shot + b.ivs.defense)
      );
    case 'species':
      return b.species.localeCompare(a.species, 'fr');
  }
}
