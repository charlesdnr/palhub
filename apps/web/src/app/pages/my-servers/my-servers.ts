import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { ServerDto } from '@palhub/shared';
import { AuthService } from '../../core/auth.service';
import { ServersService } from '../../core/servers.service';

@Component({
  selector: 'app-my-servers',
  imports: [RouterLink, FormsModule, DatePipe],
  templateUrl: './my-servers.html',
  styleUrl: './my-servers.scss',
})
export class MyServersPage {
  private readonly servers = inject(ServersService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly mine = signal<ServerDto[] | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly creating = signal(false);

  protected name = '';
  protected slug = '';
  protected description = '';
  protected playersInformed = false;

  constructor() {
    void this.reload();
  }

  private async reload(): Promise<void> {
    this.mine.set(await this.servers.listMine());
  }

  /** Pré-remplit le slug depuis le nom tant que l'admin ne l'a pas édité lui-même. */
  protected suggestSlug(): void {
    this.slug = this.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  protected async create(): Promise<void> {
    this.error.set('');
    if (!this.playersInformed) {
      this.error.set('Merci d’attester que tu informes les joueurs de ton serveur.');
      return;
    }
    this.creating.set(true);
    try {
      await this.servers.create({
        name: this.name.trim(),
        slug: this.slug.trim(),
        description: this.description.trim() || undefined,
        playersInformed: true,
      });
      this.name = this.slug = this.description = '';
      this.playersInformed = false;
      await this.reload();
    } catch (e: unknown) {
      const err = e as { error?: { message?: string } };
      this.error.set(err.error?.message ?? 'Création impossible');
    } finally {
      this.creating.set(false);
    }
  }

  protected async deleteAccount(): Promise<void> {
    if (
      !confirm(
        'Supprimer définitivement ton compte, tes serveurs et toutes leurs données ? Action irréversible.',
      )
    ) {
      return;
    }
    await this.auth.deleteAccount();
    await this.router.navigateByUrl('/');
  }
}
