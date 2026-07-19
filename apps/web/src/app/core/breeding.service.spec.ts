import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withFetch,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import type { Pal } from '@palhub/shared';
import {
  BreedingData,
  BreedingService,
  fmtEggs,
  passProb,
  passProbFinal,
  pct,
} from './breeding.service';

/* Les fonctions de probabilité sont un port fidèle de palcalc : ces tests
   verrouillent les invariants mathématiques et quelques valeurs connues, pour
   qu'un futur refactor ne les casse pas en silence. */
describe('breeding — probabilités (fonctions pures)', () => {
  it('passProbFinal : une passive voulue, pool de 1, exactement 1 finale', () => {
    // pool=1, on veut 1 passive, l'enfant finit avec 1 passive : transmission
    // directe garantie côté parent (PASS_DIRECT[1]=0.4) * random 0 parasite.
    const p = passProbFinal(1, 1, 1);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('passProb : demander 0 passive vaut toujours 1 (rien à transmettre)', () => {
    for (let pool = 0; pool <= 4; pool++) {
      expect(passProb(pool, 0, 4)).toBeCloseTo(1, 10);
    }
  });

  it('passProb : demander plus que 4 ou plus que le pool est impossible', () => {
    expect(passProb(3, 5, 4)).toBe(0);
    expect(passProb(2, 3, 4)).toBe(0);
  });

  it('passProb : borne maxIrr réduit (ou égale) la probabilité', () => {
    // moins de parasites tolérés ⇒ probabilité ≤
    const strict = passProb(4, 2, 0);
    const loose = passProb(4, 2, 4);
    expect(strict).toBeLessThanOrEqual(loose);
    expect(strict).toBeGreaterThan(0);
  });

  it('passProb : toute probabilité reste dans [0, 1]', () => {
    for (let pool = 0; pool <= 4; pool++) {
      for (let des = 0; des <= 4; des++) {
        for (let irr = 0; irr <= 4; irr++) {
          const v = passProb(pool, des, irr);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it('pct : formatage français avec virgule décimale', () => {
    expect(pct(0.5)).toBe('50 %');
    expect(pct(1)).toBe('100 %');
    expect(pct(0.05)).toContain(',');
    expect(pct(0.5).endsWith(' %')).toBe(true);
  });

  it('fmtEggs : au moins 1 œuf, jamais 0', () => {
    expect(fmtEggs(0.2)).toContain('1');
    expect(fmtEggs(0)).toContain('1');
    expect(fmtEggs(1234).includes('œufs')).toBe(true);
  });
});

/* Table de reproduction : mini-jeu synthétique de 3 espèces pour vérifier
   l'indexation triangulaire (childIdx) sans dépendre du vrai breeding.json. */
function synthData(): BreedingData {
  const n = 3;
  // matrice enfant symétrique aplatie en triangle supérieur, valeurs 16 bits LE.
  // couples : (0,0)->0, (0,1)->2, (0,2)->1, (1,1)->1, (1,2)->0, (2,2)->2
  const pairs: [number, number, number][] = [
    [0, 0, 0],
    [0, 1, 2],
    [0, 2, 1],
    [1, 1, 1],
    [1, 2, 0],
    [2, 2, 2],
  ];
  const size = (n * (n + 1)) / 2;
  const table = new Uint16Array(size);
  const at = (i: number, j: number) => i * n - (i * (i - 1)) / 2 + (j - i);
  for (const [i, j, c] of pairs) table[at(i, j)] = c;
  const bytes = new Uint8Array(table.buffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return {
    version: 'test',
    n,
    species: [
      { id: 'AAA', fr: 'Aaa', m: 0.5 },
      { id: 'BBB', fr: 'Bbb', m: 0.5 },
      { id: 'CCC', fr: 'Ccc', m: 0.5 },
    ],
    special: {},
    table: btoa(bin),
  };
}

describe('breeding — table (childIdx / pairsFor)', () => {
  let svc: BreedingService;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
        BreedingService,
      ],
    });
    svc = TestBed.inject(BreedingService);
    http = TestBed.inject(HttpTestingController);
    const load = svc.load();
    http.expectOne('/game-assets/data/breeding.json').flush(synthData());
    await load;
  });

  afterEach(() => http.verify());

  it('childIdx est symétrique', () => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(svc.childIdx(i, j)).toBe(svc.childIdx(j, i));
      }
    }
  });

  it('childIdx rend les enfants attendus', () => {
    expect(svc.childIdx(0, 1)).toBe(2);
    expect(svc.childIdx(0, 2)).toBe(1);
    expect(svc.childIdx(1, 2)).toBe(0);
    expect(svc.childIdx(2, 2)).toBe(2);
  });

  it('pairsFor : retrouve tous les couples qui donnent un enfant', () => {
    // enfant 0 : (0,0) et (1,2)
    const parents0 = svc.pairsFor(0).map(([i, j]) => `${i}-${j}`).sort();
    expect(parents0).toContain('0-0');
    expect(parents0).toContain('1-2');
  });

  it('idxOf est insensible à la casse', () => {
    expect(svc.idxOf('aaa')).toBe(0);
    expect(svc.idxOf('AAA')).toBe(0);
    expect(svc.idxOf('inconnu')).toBeUndefined();
  });

  it('breedable : espèce connue + genre requis', () => {
    const base = {
      id: '1', owner: null, species_id: 'AAA', nickname: null, level: 1,
      rank: 1, lucky: false, alpha: false, ivs: { hp: 0, shot: 0, defense: 0 },
      passives: [], container: null, slot: 0,
    };
    expect(svc.breedable({ ...base, species: 'Aaa', gender: 'male' } as Pal)).toBe(true);
    expect(svc.breedable({ ...base, species: 'Aaa', gender: null } as Pal)).toBe(false);
    expect(svc.breedable({ ...base, species: 'X', species_id: 'ZZZ', gender: 'male' } as Pal)).toBe(false);
  });
});
