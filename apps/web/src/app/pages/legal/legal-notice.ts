import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Mentions légales. */
@Component({
  selector: 'app-legal-notice',
  imports: [RouterLink],
  template: `
    <article class="legal">
      <h1>Mentions légales</h1>

      <h2>Éditeur</h2>
      <p>
        Ce site est édité par Charles Denner, à titre individuel (projet
        non commercial), contact :
        <a href="mailto:charles.denner@protonmail.com">charles.denner&#64;protonmail.com</a>.
      </p>

      <h2>Hébergement</h2>
      <p>
        Application hébergée par <b>Render</b> (Render Services, Inc., San
        Francisco, Californie, États-Unis — <a href="https://render.com" target="_blank" rel="noopener">render.com</a>).
      </p>
      <p>
        Base de données hébergée par <b>Neon</b> (Neon Inc., États-Unis —
        <a href="https://neon.tech" target="_blank" rel="noopener">neon.tech</a>).
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Palworld et ses éléments graphiques sont © Pocketpair, Inc. PalHub est un
        projet indépendant, non affilié à Pocketpair. Les données de jeu et
        icônes proviennent des sources documentées dans le dépôt du projet.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la
        <a routerLink="/confidentialite">politique de confidentialité</a>.
      </p>

      <p><a routerLink="/">← Retour à l'accueil</a></p>
    </article>
  `,
  styles: `
    .legal {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 1.2rem 4rem;
      line-height: 1.6;
    }
    .legal h2 {
      margin-top: 1.8rem;
    }
  `,
})
export class LegalNoticePage {}
