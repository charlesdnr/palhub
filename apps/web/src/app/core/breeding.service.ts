import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Pal } from '@palhub/shared';
import { firstValueFrom } from 'rxjs';
import { ivTotal } from './palbox-data.service';

/* Moteur de breeding — port fidèle de l'ancien site/app.js (lui-même un portage
   de palcalc). Aucune formule inventée : on lit la table du jeu embarquée dans
   game-assets/data/breeding.json. */

export interface BreedingSpecies {
  id: string;
  fr: string;
  /** probabilité de naître mâle (0..1) */
  m: number;
  /** passives garanties par l'espèce */
  g?: string[];
}

export interface BreedingData {
  version: string;
  n: number;
  species: BreedingSpecies[];
  /** l'unique couple genré du jeu : {espèce de la femelle → enfant} */
  special: Record<string, string>;
  table: string;
}

export const HOLE = 0xffff;

const PASS_DIRECT = [0, 0.4, 0.3, 0.2, 0.1];
const PASS_RANDOM = [0.4, 0.3, 0.2, 0.1, 0];
const PASS_RANDOM_AT_LEAST = [1, 0.6, 0.3, 0.1, 0];

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** P(l'enfant finit avec exactement nf passives, dont les desN voulues). */
export function passProbFinal(poolN: number, desN: number, nf: number): number {
  let total = 0;
  for (let ni = desN; ni <= 4; ni++) {
    const actual = Math.min(ni, poolN);
    const irrParent = actual - desN;
    const irrRandom = Math.max(0, nf - actual);
    if (actual + irrRandom > nf) continue;
    let pParent: number;
    if (desN === 0) pParent = PASS_DIRECT[ni];
    else if (irrParent === 0) pParent = PASS_DIRECT[ni] / choose(poolN, desN);
    else pParent = (choose(poolN - desN, irrParent) / choose(poolN, actual)) * PASS_DIRECT[ni];
    const pRandom = nf === 4 ? PASS_RANDOM_AT_LEAST[irrRandom] : PASS_RANDOM[irrRandom];
    total += pParent * pRandom;
  }
  return total;
}

/** P(toutes les voulues présentes, avec au plus maxIrr parasites). */
export function passProb(poolN: number, desN: number, maxIrr: number): number {
  if (desN > 4 || desN > poolN) return 0;
  let total = 0;
  for (let nf = desN; nf <= Math.min(4, desN + maxIrr); nf++) {
    total += passProbFinal(poolN, desN, nf);
  }
  return total;
}

export const pct = (p: number): string =>
  (p >= 0.1
    ? String(Math.round(p * 100))
    : (p * 100).toFixed(p >= 0.01 ? 1 : 2).replace('.', ',')) + ' %';

export const fmtEggs = (e: number): string =>
  '~' + Math.max(1, Math.round(e)).toLocaleString('fr') + ' œufs';

export interface PairPlan {
  m: Pal;
  f: Pal;
  poolN: number;
  P: number;
}

export interface SolvePlan {
  kind: 1 | 2;
  eggsTotal: number;
  // kind 1
  m?: Pal;
  f?: Pal;
  P?: number;
  // kind 2
  step1?: PairPlan;
  zSp?: number;
  zGender?: 'male' | 'female';
  need?: number;
  w?: Pal;
  comp?: { eggs1: number; eggs2: number; total: number };
}

const popcount = (b: number): number => {
  let c = 0;
  while (b) {
    c += b & 1;
    b >>= 1;
  }
  return c;
};

@Injectable({ providedIn: 'root' })
export class BreedingService {
  private readonly http = inject(HttpClient);
  private loading?: Promise<BreedingData | null>;

  data: BreedingData | null = null;
  private table: Uint16Array | null = null;
  private idx: Map<string, number> | null = null;
  private childMap: Map<number, [number, number, number][]> | null = null;

  load(): Promise<BreedingData | null> {
    this.loading ??= firstValueFrom(
      this.http.get<BreedingData>('/game-assets/data/breeding.json'),
    )
      .then((d) => {
        this.data = d;
        const bin = atob(d.table);
        this.table = new Uint16Array(bin.length / 2);
        for (let k = 0; k < this.table.length; k++) {
          this.table[k] = bin.charCodeAt(2 * k) | (bin.charCodeAt(2 * k + 1) << 8);
        }
        // insensible à la casse : l'export palbox a des species_id mal casés
        this.idx = new Map(d.species.map((s, i) => [s.id.toLowerCase(), i]));
        return d;
      })
      .catch(() => null);
    return this.loading;
  }

  spIdx(p: Pal): number | undefined {
    return this.idx?.get(p.species_id.toLowerCase());
  }

  idxOf(id: string): number | undefined {
    return this.idx?.get(id.toLowerCase());
  }

  breedable(p: Pal): boolean {
    return this.spIdx(p) !== undefined && (p.gender === 'male' || p.gender === 'female');
  }

  childIdx(i: number, j: number): number {
    if (i > j) {
      const t = i;
      i = j;
      j = t;
    }
    return this.table![i * this.data!.n - (i * (i - 1)) / 2 + (j - i)];
  }

  /** enfant -> [[spA, spB, forcé(1 = A femelle/B mâle imposés)]] */
  pairsFor(t: number): [number, number, number][] {
    if (!this.childMap) {
      this.childMap = new Map();
      const n = this.data!.n;
      for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
          const c = this.childIdx(i, j);
          if (c === HOLE) continue;
          let arr = this.childMap.get(c);
          if (!arr) {
            arr = [];
            this.childMap.set(c, arr);
          }
          arr.push([i, j, 0]);
        }
      }
      for (const [fem, ch] of Object.entries(this.data!.special)) {
        const other = Object.keys(this.data!.special).find((k) => k !== fem)!;
        const c = this.idxOf(ch)!;
        let arr = this.childMap.get(c);
        if (!arr) {
          arr = [];
          this.childMap.set(c, arr);
        }
        arr.push([this.idxOf(fem)!, this.idxOf(other)!, 1]);
      }
    }
    return this.childMap.get(t) ?? [];
  }

  /* -- solveur (2 étapes max) — port de svSolve/svReps/svPairPlans/svCompose -- */

  private reps(pals: Pal[], names: string[]): Map<string, { bits: number; pal: Pal }[]> {
    const best = new Map<string, Map<number, Pal>>();
    for (const p of pals) {
      if (!this.breedable(p)) continue;
      let bits = 0;
      for (let k = 0; k < names.length; k++) if (p.passives.includes(names[k])) bits |= 1 << k;
      const key = this.spIdx(p) + '|' + p.gender;
      let m = best.get(key);
      if (!m) {
        m = new Map();
        best.set(key, m);
      }
      const cur = m.get(bits);
      if (
        !cur ||
        p.passives.length < cur.passives.length ||
        (p.passives.length === cur.passives.length && ivTotal(p) > ivTotal(cur))
      ) {
        m.set(bits, p);
      }
    }
    const reps = new Map<string, { bits: number; pal: Pal }[]>();
    for (const [k, m] of best) {
      reps.set(k, [...m].map(([bits, pal]) => ({ bits, pal })));
    }
    return reps;
  }

  private pairPlans(
    t: number,
    full: number,
    reps: Map<string, { bits: number; pal: Pal }[]>,
  ): PairPlan[] {
    const cnt = popcount(full);
    const plans: PairPlan[] = [];
    for (const [i, j, forced] of this.pairsFor(t)) {
      const orients = forced ? [[j, i]] : i === j ? [[i, i]] : [[i, j], [j, i]];
      for (const [ms, fs] of orients) {
        for (const m of reps.get(ms + '|male') ?? []) {
          for (const f of reps.get(fs + '|female') ?? []) {
            if (((m.bits | f.bits) & full) !== full) continue;
            const poolN = new Set([...m.pal.passives, ...f.pal.passives]).size;
            plans.push({ m: m.pal, f: f.pal, poolN, P: passProb(poolN, cnt, 4) });
          }
        }
      }
    }
    return plans.sort(
      (a, b) => b.P - a.P || ivTotal(b.m) + ivTotal(b.f) - ivTotal(a.m) - ivTotal(a.f),
    );
  }

  private compose(
    sub: PairPlan,
    needN: number,
    zGenderProb: number,
    wTotal: number,
    fullN: number,
  ): { eggs1: number; eggs2: number; total: number } | null {
    if (zGenderProb <= 0) return null;
    const cases: [number, number][] = [];
    for (let k = 0; k + needN <= 4; k++) {
      const p1 = passProbFinal(sub.poolN, needN, needN + k);
      if (p1 <= 0) continue;
      cases.push([p1, passProb(needN + k + wTotal, fullN, 4)]);
    }
    const P1 = cases.reduce((s, [p]) => s + p, 0);
    if (!P1) return null;
    const eggs1 = 1 / (P1 * zGenderProb);
    let eggs2 = 0;
    for (const [p1, p2] of cases) {
      if (p2 <= 0) return null;
      eggs2 += p1 / P1 / p2;
    }
    return { eggs1, eggs2, total: eggs1 + eggs2 };
  }

  solve(
    t: number,
    names: string[],
    pals: Pal[],
  ): { covered: string[]; plans: SolvePlan[]; eff: string[] } {
    const gT = this.data!.species[t].g ?? [];
    const eff = names.filter((n) => !gT.includes(n));
    const covered = names.filter((n) => gT.includes(n));
    if (!eff.length) return { covered, plans: [], eff };
    const reps = this.reps(pals, eff);
    const full = (1 << eff.length) - 1;
    const fullN = eff.length;

    const plans: SolvePlan[] = this.pairPlans(t, full, reps)
      .slice(0, 8)
      .map((p) => ({ kind: 1 as const, ...p, eggsTotal: 1 / p.P }));

    const subCache = new Map<number, PairPlan | null>();
    const sub = (u: number, need: number): PairPlan | null => {
      const key = u * 16 + need;
      if (!subCache.has(key)) {
        const arr = this.pairPlans(u, need, reps);
        subCache.set(key, arr.length ? arr[0] : null);
      }
      return subCache.get(key)!;
    };

    for (const [i, j, forced] of this.pairsFor(t)) {
      const orients = forced ? [[j, i]] : i === j ? [[i, i]] : [[i, j], [j, i]];
      for (const [ms, fs] of orients) {
        for (const w of reps.get(ms + '|male') ?? []) {
          const need = full & ~w.bits;
          if (!need) continue;
          const s = sub(fs, need);
          if (!s) continue;
          const comp = this.compose(
            s, popcount(need), 1 - this.data!.species[fs].m, w.pal.passives.length, fullN,
          );
          if (comp) {
            plans.push({
              kind: 2, step1: s, zSp: fs, zGender: 'female', need,
              w: w.pal, comp, eggsTotal: comp.total,
            });
          }
        }
        for (const w of reps.get(fs + '|female') ?? []) {
          const need = full & ~w.bits;
          if (!need) continue;
          const s = sub(ms, need);
          if (!s) continue;
          const comp = this.compose(
            s, popcount(need), this.data!.species[ms].m, w.pal.passives.length, fullN,
          );
          if (comp) {
            plans.push({
              kind: 2, step1: s, zSp: ms, zGender: 'male', need,
              w: w.pal, comp, eggsTotal: comp.total,
            });
          }
        }
      }
    }

    const seen = new Set<string>();
    const uniq: SolvePlan[] = [];
    for (const p of plans.sort((a, b) => a.eggsTotal - b.eggsTotal)) {
      const key =
        p.kind === 1
          ? '1|' + p.m!.id + '|' + p.f!.id
          : '2|' + p.step1!.m.id + '|' + p.step1!.f.id + '|' + p.zSp + '|' + p.w!.id;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(p);
      if (uniq.length >= 10) break;
    }
    return { covered, plans: uniq, eff };
  }
}
