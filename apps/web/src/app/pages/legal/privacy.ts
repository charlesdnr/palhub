import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Politique de confidentialité (RGPD). */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink],
  template: `
    <article class="legal">
      <h1>Politique de confidentialité</h1>
      <p class="dim">Dernière mise à jour : 2026-07-19</p>

      <h2>Responsable du traitement</h2>
      <p>
        PalHub est édité par Charles Denner, à titre individuel, joignable à
        <a href="mailto:charles.denner@protonmail.com">charles.denner&#64;protonmail.com</a>.
      </p>

      <h2>Données traitées</h2>
      <ul>
        <li>
          <b>Comptes administrateurs</b> : identifiant, pseudo et avatar Discord,
          récupérés lors de la connexion OAuth (finalité : authentification et
          gestion des serveurs).
        </li>
        <li>
          <b>Données de jeu des joueurs</b> d'un serveur enregistré : pseudo,
          niveau, position dans le monde, ancienneté de connexion, appartenance à
          une guilde, et pals possédés. Elles sont extraites du fichier de
          sauvegarde du serveur de jeu par l'administrateur de celui-ci.
        </li>
      </ul>

      <h2>Base légale et information des joueurs</h2>
      <p>
        Les données de jeu sont publiées à la demande de l'administrateur du
        serveur, qui atteste informer ses joueurs (règles du serveur, Discord).
        L'administrateur est le point de contact naturel des joueurs de son
        serveur ; PalHub met à sa disposition des outils d'exclusion et de purge.
      </p>

      <h2>Durée de conservation</h2>
      <ul>
        <li>État instantané (carte) : un seul enregistrement, remplacé à chaque synchro.</li>
        <li>Historique des pals : les 30 dernières synchros, et au maximum 90 jours.</li>
      </ul>

      <h2>Vos droits</h2>
      <ul>
        <li>
          <b>Administrateurs</b> : suppression du compte et de toutes ses données
          depuis « Mes serveurs » → « Supprimer mon compte ».
        </li>
        <li>
          <b>Joueurs</b> : demandez à l'administrateur de votre serveur de vous
          exclure (vos données sont alors filtrées et l'historique purgé), ou
          contactez-nous à l'adresse ci-dessus.
        </li>
      </ul>

      <h2>Sous-traitants</h2>
      <p>
        Hébergement de l'application : Render (Render Services, Inc., États-Unis).
        Base de données : Neon (Neon Inc., États-Unis). Exécution de la
        synchronisation planifiée : GitHub Actions (GitHub, Inc., États-Unis).
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
    .legal .dim {
      color: var(--text-dim);
    }
    .legal ul {
      padding-left: 1.2rem;
    }
    .legal li {
      margin: 0.4rem 0;
    }
  `,
})
export class PrivacyPage {}
