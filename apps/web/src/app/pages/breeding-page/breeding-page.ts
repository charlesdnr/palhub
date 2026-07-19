import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Pal, PalboxSnapshot } from '@palhub/shared';
import {
  ALL,
  BASE,
  PalboxDataService,
  ivTotal,
  rankIcon,
} from '../../core/palbox-data.service';
import {
  BreedingService,
  HOLE,
  SolvePlan,
  fmtEggs,
  passProb,
  pct,
} from '../../core/breeding.service';
import { PalPortrait } from '../../shared/pal-portrait';

type Sel = { pal: Pal } | { sp: number } | null;

/** Breeding — port fidèle de l'ancien site : Parents→enfant, Enfant→parents, Objectif. */
@Component({
  selector: 'app-breeding-page',
  imports: [FormsModule, PalPortrait, NgTemplateOutlet],
  templateUrl: './breeding-page.html',
  styleUrl: './breeding-page.scss',
})
export class BreedingPage {
  private readonly dataSvc = inject(PalboxDataService);
  protected readonly br = inject(BreedingService);

  readonly slug = input.required<string>();

  protected readonly data = signal<PalboxSnapshot | null | undefined>(undefined);
  protected readonly ready = signal(false);

  protected readonly mode = signal<'fwd' | 'rev' | 'sv'>('fwd');
  protected readonly scope = signal<string | null>(null);

  // fwd
  protected readonly sel = [signal<Sel>(null), signal<Sel>(null)] as const;
  protected readonly ui = [
    { mode: signal<'box' | 'sp'>('box'), q: signal('') },
    { mode: signal<'box' | 'sp'>('box'), q: signal('') },
  ] as const;
  protected readonly want = signal<Set<string>>(new Set());
  private wantSig = '';

  // rev
  protected readonly rvSel = signal<number | null>(null);
  protected readonly rvQ = signal('');
  protected readonly rvShowAll = signal(false);

  // solveur
  protected readonly svSel = signal<number | null>(null);
  protected readonly svWant = signal<Set<string>>(new Set());
  protected readonly svQ = signal('');
  protected readonly svPassQ = signal('');

  protected readonly ALL = ALL;
  protected readonly BASE = BASE;
  protected readonly ivTotal = ivTotal;
  protected readonly rankIcon = rankIcon;
  protected readonly pct = pct;
  protected readonly fmtEggs = fmtEggs;

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.data.set(undefined);
      this.scope.set(this.dataSvc.breedBox(slug));
      void Promise.all([this.dataSvc.load(slug), this.br.load()]).then(([d]) => {
        this.data.set(d);
        this.ready.set(true);
      });
    });
  }

  /* ---------- boîte ---------- */

  protected readonly scopeOk = computed(() => {
    const d = this.data();
    const s = this.scope();
    if (!d || !s) return false;
    if (s === ALL) return true;
    if (s === BASE) return d.pals.some((p) => p.owner === null);
    return d.players.some((x) => x.uid === s);
  });

  protected readonly boxPals = computed<Pal[]>(() => {
    const d = this.data();
    const s = this.scope();
    if (!d || !s) return [];
    return this.dataSvc.palsOf(d, s);
  });

  protected setScope(v: string): void {
    this.dataSvc.setBreedBox(this.slug(), v);
    this.scope.set(v);
    for (const k of [0, 1] as const) {
      const sel = this.sel[k]();
      if (sel && 'pal' in sel && v !== ALL) {
        const owner = sel.pal.owner === null ? BASE : sel.pal.owner;
        if (owner !== v) this.sel[k].set(null);
      }
    }
    const have = new Set<string>();
    for (const p of this.boxPals()) for (const n of p.passives) have.add(n);
    const next = new Set([...this.svWant()].filter((n) => have.has(n)));
    this.svWant.set(next);
  }

  protected readonly pickEntries = computed(() => {
    const d = this.data();
    if (!d) return [];
    const mine = this.dataSvc.me(this.slug());
    const nBr = (pals: Pal[]) => pals.filter((p) => this.br.breedable(p)).length;
    const entries: { key: string; icon: string; title: string; sub: string; isMe: boolean }[] =
      d.players
        .map((pl) => ({ pl, pals: this.dataSvc.palsOf(d, pl.uid) }))
        .sort(
          (a, b) =>
            Number(b.pl.uid === mine) - Number(a.pl.uid === mine) ||
            b.pals.length - a.pals.length,
        )
        .map(({ pl, pals }) => ({
          key: pl.uid,
          icon: pl.name.slice(0, 2),
          title: pl.name,
          sub: `${nBr(pals)} pals élevables`,
          isMe: pl.uid === mine,
        }));
    const basePals = d.pals.filter((p) => p.owner === null);
    if (basePals.length) {
      entries.push({ key: BASE, icon: '🏠', title: 'Base', sub: `${nBr(basePals)} pals élevables`, isMe: false });
    }
    entries.push({ key: ALL, icon: '★', title: 'Tous les joueurs', sub: `${nBr(d.pals)} pals élevables`, isMe: false });
    return entries;
  });

  protected readonly boxOptions = computed(() => {
    const d = this.data();
    if (!d) return [];
    const opts = d.players
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((pl) => ({ value: pl.uid, label: pl.name }));
    if (d.pals.some((p) => p.owner === null)) opts.push({ value: BASE, label: 'Base' });
    opts.push({ value: ALL, label: 'Tous les joueurs' });
    return opts;
  });

  /* ---------- fwd : panneaux parents ---------- */

  protected blockedGender(k: 0 | 1): string | null {
    const other = this.sel[1 - k]();
    return other && 'pal' in other ? other.pal.gender : null;
  }

  protected palRows(k: 0 | 1): { pal: Pal; off: boolean }[] {
    const q = this.ui[k].q().trim().toLowerCase();
    const blocked = this.blockedGender(k);
    return this.boxPals()
      .filter((p) => {
        if (!this.br.breedable(p)) return false;
        if (!q) return true;
        return (
          p.species.toLowerCase().includes(q) ||
          (p.nickname ?? '').toLowerCase().includes(q) ||
          p.passives.some((s) => s.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.level - a.level || ivTotal(b) - ivTotal(a))
      .slice(0, 40)
      .map((pal) => ({ pal, off: !!blocked && pal.gender === blocked }));
  }

  protected spRows(k: 0 | 1): { fr: string; id: string; m: number; i: number }[] {
    const q = this.ui[k].q().trim().toLowerCase();
    return (this.br.data?.species ?? [])
      .map((s, i) => ({ ...s, i }))
      .filter((s) => !q || s.fr.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .sort((a, b) => a.fr.localeCompare(b.fr))
      .slice(0, 40);
  }

  protected pickPal(k: 0 | 1, p: Pal): void {
    this.sel[k].set({ pal: p });
  }

  protected pickSp(k: 0 | 1, i: number): void {
    this.sel[k].set({ sp: i });
  }

  protected clearSel(k: 0 | 1): void {
    this.sel[k].set(null);
  }

  protected swap(): void {
    const [a, b] = [this.sel[0](), this.sel[1]()];
    this.sel[0].set(b);
    this.sel[1].set(a);
    const [ma, mb] = [this.ui[0].mode(), this.ui[1].mode()];
    this.ui[0].mode.set(mb);
    this.ui[1].mode.set(ma);
    const [qa, qb] = [this.ui[0].q(), this.ui[1].q()];
    this.ui[0].q.set(qb);
    this.ui[1].q.set(qa);
  }

  /* ---------- fwd : l'œuf ---------- */

  protected readonly result = computed<
    | { state: 'wait'; msg: string }
    | { state: 'err'; msg: string }
    | { state: 'child'; child: number }
    | { state: 'special'; alts: { femFr: string; child: number }[] }
  >(() => {
    const a = this.sel[0]();
    const b = this.sel[1]();
    if (!a || !b) {
      return {
        state: 'wait',
        msg: !a && !b ? "Choisis deux parents pour voir ce qui sort de l'œuf." : 'Encore un parent à choisir.',
      };
    }
    const ga = 'pal' in a ? a.pal.gender : null;
    const gb = 'pal' in b ? b.pal.gender : null;
    if (ga && gb && ga === gb) {
      return { state: 'err', msg: 'Deux ' + (ga === 'male' ? 'mâles' : 'femelles') + " — pas d'œuf possible." };
    }
    const ia = 'pal' in a ? this.br.spIdx(a.pal)! : a.sp;
    const ib = 'pal' in b ? this.br.spIdx(b.pal)! : b.sp;
    const child = this.br.childIdx(ia, ib);
    if (child !== HOLE) return { state: 'child', child };
    const spA = this.br.data!.species[ia].id;
    const spB = this.br.data!.species[ib].id;
    let female: string | null = null;
    if (ga === 'female' || gb === 'male') female = spA;
    else if (ga === 'male' || gb === 'female') female = spB;
    if (female) {
      return { state: 'child', child: this.br.idxOf(this.br.data!.special[female])! };
    }
    return {
      state: 'special',
      alts: Object.entries(this.br.data!.special).map(([fem, ch]) => ({
        femFr: this.br.data!.species[this.br.idxOf(fem)!].fr,
        child: this.br.idxOf(ch)!,
      })),
    };
  });

  protected childInfo(i: number) {
    const s = this.br.data!.species[i];
    const pm = Math.round(s.m * 100);
    const owned = this.boxPals().filter(
      (p) => p.species_id.toLowerCase() === s.id.toLowerCase(),
    );
    const males = owned.filter((p) => p.gender === 'male').length;
    return { i, s, pm, owned: owned.length, males, females: owned.length - males };
  }

  /** pool combiné des deux parents (uniquement si deux pals réels) */
  protected readonly pool = computed<string[] | null>(() => {
    const a = this.sel[0]();
    const b = this.sel[1]();
    if (!a || !b || !('pal' in a) || !('pal' in b)) return null;
    const sig = a.pal.id + '|' + b.pal.id;
    if (sig !== this.wantSig) {
      this.wantSig = sig;
      queueMicrotask(() => this.want.set(new Set()));
    }
    return [...new Set([...a.pal.passives, ...b.pal.passives])];
  });

  protected toggleWant(name: string): void {
    const next = new Set(this.want());
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    this.want.set(next);
  }

  protected readonly probLines = computed(() => {
    const pool = this.pool();
    if (!pool || !pool.length) return null;
    const n = this.want().size;
    if (!n) {
      return { hint: `chaque passive du pool a ${pct(passProb(pool.length, 1, 4))} d'être transmise` };
    }
    if (n > 4) return { err: 'Un pal ne peut porter que 4 passives.' };
    return {
      all: passProb(pool.length, n, 4),
      exact: passProb(pool.length, n, 0),
    };
  });

  protected eggsFor(p: number): string {
    return '~1 œuf sur ' + Math.max(1, Math.round(1 / p)).toLocaleString('fr');
  }

  protected barWidth(p: number): number {
    return p > 0 ? Math.max(p * 100, 1.5) : 0;
  }

  /* ---------- rev : enfant -> parents ---------- */

  protected readonly rvTargets = computed(() => {
    const q = this.rvQ().trim().toLowerCase();
    return (this.br.data?.species ?? [])
      .map((s, i) => ({ ...s, i }))
      .filter((s) => !q || s.fr.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .sort((a, b) => a.fr.localeCompare(b.fr))
      .slice(0, 40);
  });

  private owned(): Map<number, { m: Pal[]; f: Pal[] }> {
    const own = new Map<number, { m: Pal[]; f: Pal[] }>();
    for (const p of this.boxPals()) {
      if (!this.br.breedable(p)) continue;
      const i = this.br.spIdx(p)!;
      let e = own.get(i);
      if (!e) {
        e = { m: [], f: [] };
        own.set(i, e);
      }
      e[p.gender === 'male' ? 'm' : 'f'].push(p);
    }
    for (const e of own.values()) {
      e.m.sort((a, b) => ivTotal(b) - ivTotal(a) || b.level - a.level);
      e.f.sort((a, b) => ivTotal(b) - ivTotal(a) || b.level - a.level);
    }
    return own;
  }

  protected readonly rvResult = computed(() => {
    const t = this.rvSel();
    const d = this.br.data;
    if (t === null || !d || !this.data()) return null;
    this.rvShowAll();

    const own = this.owned();
    const none = { m: [] as Pal[], f: [] as Pal[] };
    const side = (i: number) => own.get(i) ?? none;

    const pairs: [number, number][] = [];
    for (let i = 0; i < d.n; i++) {
      for (let j = i; j < d.n; j++) {
        if (this.br.childIdx(i, j) === t) pairs.push([i, j]);
      }
    }
    const specials: [number, number][] = [];
    for (const [fem, ch] of Object.entries(d.special)) {
      if (this.br.idxOf(ch) !== t) continue;
      const other = Object.keys(d.special).find((k) => k !== fem)!;
      specials.push([this.br.idxOf(fem)!, this.br.idxOf(other)!]);
    }

    const cat = ([i, j]: [number, number]): number => {
      const A = side(i);
      const B = side(j);
      const ok =
        i === j
          ? A.m.length && A.f.length
          : (A.m.length && B.f.length) || (B.m.length && A.f.length);
      if (ok) return 0;
      return A.m.length + A.f.length + B.m.length + B.f.length ? 1 : 2;
    };
    const catG = ([i, j]: [number, number]): number => {
      const A = side(i);
      const B = side(j);
      if (A.f.length && B.m.length) return 0;
      return A.m.length + A.f.length + B.m.length + B.f.length ? 1 : 2;
    };
    const score = ([i, j]: [number, number]): number => {
      const A = side(i);
      const B = side(j);
      if (i === j) return A.m.length && A.f.length ? ivTotal(A.m[0]) + ivTotal(A.f[0]) : 0;
      const s1 = A.m.length && B.f.length ? ivTotal(A.m[0]) + ivTotal(B.f[0]) : -1;
      const s2 = B.m.length && A.f.length ? ivTotal(B.m[0]) + ivTotal(A.f[0]) : -1;
      return Math.max(s1, s2);
    };

    const groups: [number, number][][] = [[], [], []];
    for (const p of pairs) groups[cat(p)].push(p);
    groups[0].sort((a, b) => score(b) - score(a));
    const nOf = ([i, j]: [number, number]) =>
      side(i).m.length + side(i).f.length + side(j).m.length + side(j).f.length;
    groups[1].sort((a, b) => nOf(b) - nOf(a));
    groups[2].sort((a, b) => d.species[a[0]].fr.localeCompare(d.species[b[0]].fr));

    const mkRow = (p: [number, number], c: number, gendered: boolean) => ({
      i: p[0],
      j: p[1],
      cat: c,
      gendered,
      a: this.rvCell(p[0], side, gendered ? 'f' : null),
      b: this.rvCell(p[1], side, gendered ? 'm' : null),
    });

    const rows = [
      ...specials.map((p) => mkRow(p, catG(p), true)),
      ...groups[0].map((p) => mkRow(p, 0, false)),
      ...groups[1].map((p) => mkRow(p, 1, false)),
      ...(this.rvShowAll() ? groups[2].map((p) => mkRow(p, 2, false)) : []),
    ];

    return {
      total: pairs.length + specials.length,
      feasible: groups[0].length + specials.filter((p) => catG(p) === 0).length,
      hiddenCount: this.rvShowAll() ? 0 : groups[2].length,
      rows,
      targetFr: d.species[t].fr,
    };
  });

  private rvCell(
    idx: number,
    side: (i: number) => { m: Pal[]; f: Pal[] },
    forced: 'm' | 'f' | null,
  ) {
    const s = this.br.data!.species[idx];
    const o = side(idx);
    return {
      id: s.id,
      fr: s.fr,
      forced,
      own: o.m.length + o.f.length ? `${o.m.length} ♂ · ${o.f.length} ♀` : 'absent',
    };
  }

  protected rvUse(i: number, j: number, gendered: boolean): void {
    const own = this.owned();
    const none = { m: [] as Pal[], f: [] as Pal[] };
    const A = own.get(i) ?? none;
    const B = own.get(j) ?? none;
    let pa: Pal | null = null;
    let pb: Pal | null = null;
    if (gendered) {
      if (A.f.length) pa = A.f[0];
      if (B.m.length) pb = B.m[0];
    } else if (i === j) {
      if (A.m.length && A.f.length) {
        pa = A.m[0];
        pb = A.f[0];
      }
    } else {
      const s1 = A.m.length && B.f.length ? ivTotal(A.m[0]) + ivTotal(B.f[0]) : -1;
      const s2 = B.m.length && A.f.length ? ivTotal(B.m[0]) + ivTotal(A.f[0]) : -1;
      if (s1 >= s2 && s1 >= 0) {
        pa = A.m[0];
        pb = B.f[0];
      } else if (s2 >= 0) {
        pa = B.m[0];
        pb = A.f[0];
      }
    }
    this.sel[0].set(pa ? { pal: pa } : { sp: i });
    this.sel[1].set(pb ? { pal: pb } : { sp: j });
    this.mode.set('fwd');
    scrollTo(0, 0);
  }

  protected showAllPairs(): void {
    this.rvShowAll.set(true);
  }

  protected gotoRev(i: number): void {
    this.rvSel.set(i);
    this.rvShowAll.set(false);
    this.mode.set('rev');
  }

  /* ---------- solveur ---------- */

  protected readonly svTargets = computed(() => {
    const q = this.svQ().trim().toLowerCase();
    return (this.br.data?.species ?? [])
      .map((s, i) => ({ ...s, i }))
      .filter((s) => !q || s.fr.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .sort((a, b) => a.fr.localeCompare(b.fr))
      .slice(0, 40);
  });

  protected readonly svPassList = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.boxPals()) {
      if (!this.br.breedable(p)) continue;
      for (const n of p.passives) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    for (const n of this.svWant()) if (!counts.has(n)) counts.set(n, 0);
    const q = this.svPassQ().trim().toLowerCase();
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .filter(([name]) => !q || name.toLowerCase().includes(q));
  });

  protected toggleSvWant(name: string): void {
    const next = new Set(this.svWant());
    if (next.has(name)) {
      next.delete(name);
    } else if (next.size < 4) {
      next.add(name);
    } else {
      return;
    }
    this.svWant.set(next);
  }

  protected readonly svResult = computed(() => {
    const t = this.svSel();
    if (t === null || !this.br.data || !this.data()) return null;
    if (!this.svWant().size) return { waiting: true } as const;
    const names = [...this.svWant()];
    const { covered, plans, eff } = this.br.solve(t, names, this.boxPals());
    return { waiting: false, covered, plans, eff, hl: new Set(eff) } as const;
  });

  protected svNeedNames(plan: SolvePlan, eff: string[]): string {
    return eff.filter((_, k) => plan.need! & (1 << k)).join(', ');
  }

  protected wantedOf(p: Pal, hl: Set<string>): string {
    const wanted = p.passives.filter((x) => hl.has(x));
    const rest = p.passives.length - wanted.length;
    return (wanted.length ? wanted.join(', ') : 'aucune visée') + (rest ? ` +${rest}` : '');
  }

  protected svOpen(a: Sel, b: Sel): void {
    this.sel[0].set(a);
    this.sel[1].set(b);
    this.mode.set('fwd');
    scrollTo(0, 0);
  }

  protected spOf(i: number) {
    return this.br.data!.species[i];
  }

  /* ---------- divers ---------- */

  protected ownerName(p: Pal): string {
    const d = this.data();
    return d ? this.dataSvc.ownerName(d, p) : '';
  }

  protected passRank(name: string): number {
    return this.data()?.passive_ranks[name] ?? 1;
  }

  protected mPct(m: number): number {
    return Math.round(m * 100);
  }

  /* accès typé aux membres de l'union Sel depuis le template */
  protected palOf(s: Sel): Pal | null {
    return s && 'pal' in s ? s.pal : null;
  }

  protected selSp(s: Sel): number {
    return s && 'sp' in s ? s.sp : 0;
  }
}
