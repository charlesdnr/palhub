import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Mentions légales. À compléter par l'exploitant ([À COMPLÉTER]). */
@Component({
  selector: 'app-legal-notice',
  imports: [RouterLink],
  template: `
    <article class="legal">
      <h1>Mentions légales</h1>

      <h2>Éditeur</h2>
      <p>
        Ce site est édité par [À COMPLÉTER : nom / structure], contact :
        <a href="mailto:[À COMPLÉTER]">[À COMPLÉTER : e-mail]</a>.
      </p>

      <h2>Hébergement</h2>
      <p>[À COMPLÉTER : hébergeur, raison sociale et adresse].</p>

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
