import { Component, inject, input, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { ServerDto } from '@palhub/shared';
import { ServersService } from '../../core/servers.service';

@Component({
  selector: 'app-server-settings',
  imports: [FormsModule, RouterLink],
  templateUrl: './server-settings.html',
  styleUrl: './server-settings.scss',
})
export class ServerSettingsPage {
  private readonly servers = inject(ServersService);
  private readonly router = inject(Router);

  /** id de route (withComponentInputBinding) */
  readonly id = input.required<string>();

  protected readonly server = signal<ServerDto | undefined>(undefined);
  protected readonly newKey = signal('');
  protected readonly copied = signal(false);
  protected readonly saving = signal(false);
  protected readonly origin = window.location.origin;

  protected description = '';

  constructor() {
    effect(() => {
      const id = this.id();
      void this.servers.getMine(id).then((s) => {
        this.server.set(s);
        this.description = s.description ?? '';
      });
    });
  }

  protected async rotateKey(): Promise<void> {
    const s = this.server();
    if (!s) return;
    if (
      s.apiKeyPrefix &&
      !confirm("Générer une nouvelle clé invalide l'ancienne. Continuer ?")
    ) {
      return;
    }
    const { apiKey } = await this.servers.rotateApiKey(s.id);
    this.newKey.set(apiKey);
    this.copied.set(false);
    this.server.set(await this.servers.getMine(s.id));
  }

  protected async copyKey(): Promise<void> {
    await navigator.clipboard.writeText(this.newKey());
    this.copied.set(true);
  }

  protected async toggleListed(): Promise<void> {
    const s = this.server();
    if (!s) return;
    this.server.set(
      await this.servers.update(s.id, { isListed: !s.isListed }),
    );
  }

  protected async saveDescription(): Promise<void> {
    const s = this.server();
    if (!s) return;
    this.saving.set(true);
    try {
      this.server.set(
        await this.servers.update(s.id, {
          description: this.description.trim() || null,
        }),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const s = this.server();
    if (!s) return;
    if (!confirm(`Supprimer « ${s.name} » et toutes ses données ?`)) return;
    await this.servers.remove(s.id);
    await this.router.navigateByUrl('/me/servers');
  }
}
