import { Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { InviteInfoDto } from '@palhub/shared';
import { AuthService } from '../../core/auth.service';
import { ServersService } from '../../core/servers.service';

/** Page d'acceptation d'une invitation co-admin (lien partagé sur Discord). */
@Component({
  selector: 'app-invite-page',
  templateUrl: './invite-page.html',
  styleUrl: './invite-page.scss',
})
export class InvitePage {
  private readonly servers = inject(ServersService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly token = input.required<string>();

  protected readonly info = signal<InviteInfoDto | null | undefined>(undefined);
  protected readonly accepting = signal(false);
  protected readonly error = signal('');

  constructor() {
    effect(() => {
      const token = this.token();
      this.info.set(undefined);
      void this.servers.getInviteInfo(token).then(
        (i) => this.info.set(i),
        () => this.info.set(null),
      );
    });
    void this.auth.ensureLoaded();
  }

  protected loginThenAccept(): void {
    this.auth.login('/invite/' + this.token());
  }

  protected async accept(): Promise<void> {
    this.error.set('');
    this.accepting.set(true);
    try {
      await this.servers.acceptInvite(this.token());
      await this.router.navigateByUrl('/me/servers');
    } catch (e: unknown) {
      const err = e as { error?: { message?: string } };
      this.error.set(err.error?.message ?? "Impossible d'accepter l'invitation");
    } finally {
      this.accepting.set(false);
    }
  }
}
