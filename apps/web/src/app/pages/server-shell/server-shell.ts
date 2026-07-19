import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { PublicServerDto } from '@palhub/shared';
import { ServersService } from '../../core/servers.service';

/** Enveloppe des pages publiques d'un serveur : en-tête + onglets Carte / Palbox. */
@Component({
  selector: 'app-server-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell-bar">
      @if (server(); as s) {
        <h1>{{ s.name }}</h1>
      } @else if (notFound()) {
        <h1>Serveur inconnu</h1>
      }
      <nav class="tabs">
        <a [routerLink]="['/s', slug()]" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Carte</a>
        <a [routerLink]="['/s', slug(), 'palbox']" routerLinkActive="active">Palbox</a>
        <a [routerLink]="['/s', slug(), 'breeding']" routerLinkActive="active">Breeding</a>
      </nav>
    </div>
    @if (notFound()) {
      <p class="nf">Ce serveur n'existe pas (ou plus). <a routerLink="/">Retour à l'accueil</a></p>
    } @else {
      <router-outlet />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .shell-bar {
      display: flex;
      align-items: center;
      gap: 1.4rem;
      padding: 0.45rem 1.2rem;
      background: var(--panel);
      border-bottom: 1px solid var(--border);

      h1 {
        font-size: 1.05rem;
        margin: 0;
      }
    }

    .tabs {
      display: flex;
      gap: 0.3rem;

      a {
        padding: 0.3rem 0.85rem;
        border-radius: 8px;
        color: var(--text-dim);
        text-decoration: none;

        &.active {
          background: var(--panel-2);
          color: var(--text);
        }

        &:hover {
          color: var(--text);
        }
      }
    }

    .nf {
      padding: 2rem 1.2rem;
      color: var(--text-dim);
    }
  `,
})
export class ServerShell {
  private readonly servers = inject(ServersService);

  readonly slug = input.required<string>();
  protected readonly server = signal<PublicServerDto | undefined>(undefined);
  protected readonly notFound = signal(false);

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.notFound.set(false);
      void this.servers.getPublic(slug).then(
        (s) => this.server.set(s),
        () => this.notFound.set(true),
      );
    });
  }
}
