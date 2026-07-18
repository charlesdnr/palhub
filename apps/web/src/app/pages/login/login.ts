import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  template: `
    <div class="card login-card">
      <h1>Connexion</h1>
      <p>
        PalHub utilise Discord pour identifier les admins de serveurs. Les pages
        publiques des serveurs restent accessibles sans compte.
      </p>
      <button type="button" class="btn" (click)="auth.login()">
        Se connecter avec Discord
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      padding: 4rem 1rem;
    }

    .login-card {
      max-width: 420px;
      text-align: center;

      p {
        color: var(--text-dim);
      }
    }
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
}
