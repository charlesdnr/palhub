import { Component, input, signal, effect } from '@angular/core';
import { portraitUrl } from '../core/palbox-data.service';

/** Portrait avec repli sur les initiales : le CDN renvoie des 403 intermittents
    et ne connaît pas les humains capturés. */
@Component({
  selector: 'pal-portrait',
  template: `
    @if (!failed()) {
      <img [class]="imgCls()" [src]="url" loading="lazy" alt="" (error)="failed.set(true)" />
    } @else {
      <div [class]="fbCls()">{{ species().slice(0, 2) }}</div>
    }
  `,
  styles: ':host { display: contents; }',
})
export class PalPortrait {
  readonly speciesId = input.required<string>();
  readonly species = input.required<string>();
  readonly imgCls = input('');
  readonly fbCls = input('');
  protected readonly failed = signal(false);

  protected get url(): string {
    return portraitUrl(this.speciesId());
  }

  constructor() {
    // nouvelle espèce -> on retente l'image
    effect(() => {
      this.speciesId();
      this.failed.set(false);
    });
  }
}
