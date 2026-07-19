import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Pal, PalboxSnapshot } from '@palhub/shared';
import {
  ALL,
  PalboxDataService,
  ivTotal,
  rankIcon,
} from '../../core/palbox-data.service';
import { PalPortrait } from '../../shared/pal-portrait';

const PAGE = 60;

/** Palbox d'un joueur : la grille de slots du jeu, filtres et fiche au survol. */
@Component({
  selector: 'app-box-page',
  imports: [FormsModule, RouterLink, PalPortrait],
  templateUrl: './box-page.html',
  styleUrl: './box-page.scss',
})
export class BoxPage implements AfterViewInit {
  private readonly dataSvc = inject(PalboxDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly slug = input.required<string>();
  readonly key = input.required<string>();

  protected readonly data = signal<PalboxSnapshot | null | undefined>(undefined);
  protected readonly ALL = ALL;
  protected readonly ivTotal = ivTotal;
  protected readonly rankIcon = rankIcon;

  // filtres
  protected readonly q = signal('');
  protected readonly alpha = signal(false);
  protected readonly lucky = signal(false);
  protected readonly sort = signal<'level' | 'ivs' | 'rank' | 'species'>('level');
  protected readonly lvlMin = signal(1);
  protected readonly lvlMax = signal(70);
  protected readonly ivMin = signal(0);
  protected readonly picked = signal<Set<string>>(new Set());
  protected readonly panelOpen = signal(false);
  protected readonly passq = signal('');
  protected readonly displayCount = signal(PAGE);

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private readonly peekEl = viewChild<ElementRef<HTMLElement>>('peekEl');

  // fiche flottante
  protected readonly peek = signal<Pal | null>(null);
  private pinned: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const slug = this.slug();
      const key = this.key(); // nouvelle boîte -> reset
      // untracked : resetFilters lit data()/maxLevel(), on ne veut PAS que
      // l'arrivée des données relance cet effect (sinon boucle infinie).
      untracked(() => {
        this.resetFilters();
        this.data.set(undefined);
        void this.dataSvc.load(slug).then((d) => {
          this.data.set(d);
          if (d) {
            const max = Math.max(70, ...d.pals.map((p) => p.level));
            this.lvlMax.set(max);
            if (!this.dataSvc.palsOf(d, key).length && key !== ALL) {
              void this.router.navigate(['/s', slug, 'palbox']);
            }
          }
        });
        // la recherche du hero arrive en ?q=
        const q = this.route.snapshot.queryParamMap.get('q');
        if (q) this.q.set(q);
      });
    });
    const onScroll = () => {
      this.pinned = null;
      this.peek.set(null);
    };
    addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => removeEventListener('scroll', onScroll));
  }

  ngAfterViewInit(): void {
    const target = this.sentinel()?.nativeElement;
    if (!target) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting && this.displayCount() < this.shown().length) {
          this.displayCount.update((n) => n + PAGE);
        }
      },
      { rootMargin: '600px' },
    );
    io.observe(target);
    this.destroyRef.onDestroy(() => io.disconnect());
  }

  protected readonly maxLevel = computed(() => {
    const d = this.data();
    return d ? Math.max(70, ...d.pals.map((p) => p.level)) : 70;
  });

  protected readonly scopePals = computed(() => {
    const d = this.data();
    return d ? this.dataSvc.palsOf(d, this.key()) : [];
  });

  protected readonly scopeName = computed(() => {
    const d = this.data();
    return d ? this.dataSvc.nameOf(d, this.key()) : '';
  });

  protected readonly meUid = computed(() => this.dataSvc.me(this.slug()));

  protected readonly shown = computed<Pal[]>(() => {
    const q = this.q().trim().toLowerCase();
    const [lo, hi] = [
      Math.min(this.lvlMin(), this.lvlMax()),
      Math.max(this.lvlMin(), this.lvlMax()),
    ];
    const ivMin = this.ivMin();
    const alpha = this.alpha();
    const lucky = this.lucky();
    const picked = this.picked();

    const list = this.scopePals().filter((p) => {
      if (q && !p.species.toLowerCase().includes(q) && !(p.nickname ?? '').toLowerCase().includes(q)) return false;
      if (p.level < lo || p.level > hi) return false;
      if (ivMin && ivTotal(p) < ivMin) return false;
      if (alpha && !p.alpha) return false;
      if (lucky && !p.lucky) return false;
      for (const want of picked) if (!p.passives.includes(want)) return false;
      return true;
    });

    const by = this.sort();
    return list.slice().sort((a, b) => {
      if (by === 'species') return a.species.localeCompare(b.species) || b.level - a.level;
      if (by === 'ivs') return ivTotal(b) - ivTotal(a) || b.level - a.level;
      if (by === 'rank') return b.rank - a.rank || b.level - a.level;
      return b.level - a.level || ivTotal(b) - ivTotal(a);
    });
  });

  protected readonly visible = computed(() => this.shown().slice(0, this.displayCount()));

  /** passives du scope, comptées et triées */
  protected readonly passList = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.scopePals()) {
      for (const s of p.passives) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const q = this.passq().trim().toLowerCase();
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .filter(([name]) => !q || name.toLowerCase().includes(q));
  });

  protected readonly chips = computed(() => {
    const out: { label: string; undo: () => void }[] = [];
    const q = this.q().trim();
    if (q) out.push({ label: `« ${q} »`, undo: () => this.q.set('') });
    const [lo, hi] = [
      Math.min(this.lvlMin(), this.lvlMax()),
      Math.max(this.lvlMin(), this.lvlMax()),
    ];
    if (lo > 1 || hi < this.maxLevel()) {
      out.push({
        label: `Nv ${lo}–${hi}`,
        undo: () => {
          this.lvlMin.set(1);
          this.lvlMax.set(this.maxLevel());
        },
      });
    }
    if (this.ivMin()) out.push({ label: `IVs ≥ ${this.ivMin()}`, undo: () => this.ivMin.set(0) });
    if (this.alpha()) out.push({ label: 'Alpha', undo: () => this.alpha.set(false) });
    if (this.lucky()) out.push({ label: 'Lucky', undo: () => this.lucky.set(false) });
    for (const s of this.picked()) {
      out.push({ label: s, undo: () => this.togglePassive(s) });
    }
    return out;
  });

  protected readonly hiddenFilters = computed(() => {
    const [lo, hi] = [
      Math.min(this.lvlMin(), this.lvlMax()),
      Math.max(this.lvlMin(), this.lvlMax()),
    ];
    return (lo > 1 || hi < this.maxLevel() ? 1 : 0) + (this.ivMin() ? 1 : 0) + this.picked().size;
  });

  protected resetFilters(): void {
    this.q.set('');
    this.passq.set('');
    this.alpha.set(false);
    this.lucky.set(false);
    this.sort.set('level');
    this.ivMin.set(0);
    this.lvlMin.set(1);
    this.lvlMax.set(this.maxLevel());
    this.picked.set(new Set());
    this.panelOpen.set(false);
    this.displayCount.set(PAGE);
    this.pinned = null;
    this.peek.set(null);
  }

  protected togglePassive(name: string): void {
    const next = new Set(this.picked());
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    this.picked.set(next);
  }

  protected fr(n: number): string {
    return n.toLocaleString('fr');
  }

  protected ivClass(v: number): string {
    return v >= 70 ? 'iv--hi' : v >= 40 ? 'iv--mid' : 'iv--lo';
  }

  protected stars(rank: number): string {
    return rank > 1 ? ' ★'.repeat(rank - 1) : '';
  }

  protected ownerLabel(p: Pal): string {
    const d = this.data();
    if (!d) return '';
    return d.players.find((x) => x.uid === p.owner)?.name ?? (p.owner === null ? 'Base' : p.owner);
  }

  protected passRank(name: string): number {
    return this.data()?.passive_ranks[name] ?? 1;
  }

  /* -- fiche flottante -- */

  protected enter(event: PointerEvent, p: Pal): void {
    if (event.pointerType === 'mouse' && !this.pinned) this.show(p, event.currentTarget as HTMLElement);
  }

  protected leave(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && !this.pinned) this.peek.set(null);
  }

  protected focusSlot(event: FocusEvent, p: Pal): void {
    this.show(p, event.currentTarget as HTMLElement);
  }

  protected blurSlot(): void {
    if (!this.pinned) this.peek.set(null);
  }

  protected clickSlot(event: Event, p: Pal): void {
    const target = event.currentTarget as HTMLElement;
    if (this.pinned === target) {
      this.pinned = null;
      this.peek.set(null);
    } else {
      this.pinned = target;
      this.show(p, target);
    }
  }

  private show(p: Pal, slotEl: HTMLElement): void {
    this.peek.set(p);
    // positionner après le rendu de la fiche
    requestAnimationFrame(() => {
      const k = this.peekEl()?.nativeElement;
      if (!k) return;
      const r = slotEl.getBoundingClientRect();
      const w = k.offsetWidth;
      const h = k.offsetHeight;
      let x = r.right + 10;
      if (x + w > innerWidth - 8) x = r.left - w - 10;
      if (x < 8) x = Math.min(r.right + 10, innerWidth - w - 8);
      const y = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, innerHeight - h - 8));
      k.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    });
  }
}
