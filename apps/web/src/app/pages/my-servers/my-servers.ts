import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ServerDto } from '@palhub/shared';
import { ServersService } from '../../core/servers.service';

@Component({
  selector: 'app-my-servers',
  imports: [RouterLink, FormsModule, DatePipe],
  templateUrl: './my-servers.html',
  styleUrl: './my-servers.scss',
})
export class MyServersPage {
  private readonly servers = inject(ServersService);

  protected readonly mine = signal<ServerDto[] | undefined>(undefined);
  protected readonly error = signal('');
  protected readonly creating = signal(false);

  protected name = '';
  protected slug = '';
  protected description = '';

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
    this.creating.set(true);
    try {
      await this.servers.create({
        name: this.name.trim(),
        slug: this.slug.trim(),
        description: this.description.trim() || undefined,
      });
      this.name = this.slug = this.description = '';
      await this.reload();
    } catch (e: unknown) {
      const err = e as { error?: { message?: string } };
      this.error.set(err.error?.message ?? 'Création impossible');
    } finally {
      this.creating.set(false);
    }
  }
}
