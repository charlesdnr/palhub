import { Component, inject, input, signal, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { InviteDto, MemberDto, ServerDto, SyncConfigDto } from '@palhub/shared';
import { ServersService } from '../../core/servers.service';

@Component({
  selector: 'app-server-settings',
  imports: [FormsModule, RouterLink, DatePipe],
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

  // --- synchro hébergée ---
  protected readonly syncConfig = signal<SyncConfigDto | null | undefined>(undefined);
  protected readonly syncSaving = signal(false);
  protected readonly syncError = signal('');
  protected sync = {
    host: '',
    port: 22,
    username: '',
    authType: 'password' as 'password' | 'key',
    secret: '',
    remotePath: '',
    enabled: true,
  };

  // --- invitations / membres ---
  protected readonly invite = signal<InviteDto | null | undefined>(undefined);
  protected readonly members = signal<MemberDto[]>([]);
  protected readonly inviteCopied = signal(false);

  // --- RGPD : exclusions de joueurs ---
  protected readonly players = signal<{ uid: string; name: string }[]>([]);
  protected readonly excluded = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      const id = this.id();
      void this.loadExclusions(id);
      void this.servers.getMine(id).then((s) => {
        this.server.set(s);
        this.description = s.description ?? '';
        if (s.role === 'owner') {
          void this.servers.getInvite(id).then((i) => this.invite.set(i));
        }
        void this.servers.getPalbox(s.slug).then((box) => {
          const seen = new Map<string, string>();
          for (const p of box?.players ?? []) seen.set(p.uid, p.name);
          this.players.set(
            [...seen].map(([uid, name]) => ({ uid, name })).sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          );
        });
      });
      void this.servers.listMembers(id).then((m) => this.members.set(m));
      void this.servers.getSyncConfig(id).then((c) => {
        this.syncConfig.set(c);
        if (c) {
          this.sync = {
            host: c.host,
            port: c.port,
            username: c.username,
            authType: c.authType,
            secret: '',
            remotePath: c.remotePath,
            enabled: c.enabled,
          };
        }
      });
    });
  }

  protected async saveSync(): Promise<void> {
    const s = this.server();
    if (!s) return;
    this.syncError.set('');
    this.syncSaving.set(true);
    try {
      const saved = await this.servers.putSyncConfig(s.id, {
        host: this.sync.host.trim(),
        port: Number(this.sync.port) || 22,
        username: this.sync.username.trim(),
        authType: this.sync.authType,
        secret: this.sync.secret.trim() || undefined,
        remotePath: this.sync.remotePath.trim(),
        enabled: this.sync.enabled,
      });
      this.syncConfig.set(saved);
      this.sync.secret = '';
    } catch (e: unknown) {
      const err = e as { error?: { message?: string } };
      this.syncError.set(err.error?.message ?? 'Enregistrement impossible');
    } finally {
      this.syncSaving.set(false);
    }
  }

  protected async resetHostKey(): Promise<void> {
    const s = this.server();
    if (!s) return;
    if (
      !confirm(
        "Oublier l'empreinte de la clé d'hôte ? Elle sera ré-apprise à la prochaine synchro.",
      )
    ) {
      return;
    }
    await this.servers.resetSyncHostKey(s.id);
    this.syncConfig.set(await this.servers.getSyncConfig(s.id));
  }

  protected async removeSync(): Promise<void> {
    const s = this.server();
    if (!s) return;
    if (!confirm('Supprimer la configuration de synchro hébergée ?')) return;
    await this.servers.deleteSyncConfig(s.id);
    this.syncConfig.set(null);
    this.sync = {
      host: '', port: 22, username: '', authType: 'password',
      secret: '', remotePath: '', enabled: true,
    };
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

  protected async setVisibility(
    visibility: 'public' | 'unlisted' | 'private',
  ): Promise<void> {
    const s = this.server();
    if (!s || s.visibility === visibility) return;
    this.server.set(await this.servers.update(s.id, { visibility }));
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

  protected inviteUrl(): string {
    const i = this.invite();
    return i ? `${window.location.origin}/invite/${i.token}` : '';
  }

  protected async rotateInvite(): Promise<void> {
    const s = this.server();
    if (!s) return;
    if (
      this.invite() &&
      !confirm("Générer un nouveau lien invalide l'ancien. Continuer ?")
    ) {
      return;
    }
    this.invite.set(await this.servers.rotateInvite(s.id));
    this.inviteCopied.set(false);
  }

  protected async copyInvite(): Promise<void> {
    await navigator.clipboard.writeText(
      `Rejoins-moi pour gérer « ${this.server()?.name} » sur PalHub 🐑 ${this.inviteUrl()}`,
    );
    this.inviteCopied.set(true);
  }

  protected async revokeInvite(): Promise<void> {
    const s = this.server();
    if (!s) return;
    await this.servers.revokeInvite(s.id);
    this.invite.set(null);
  }

  protected async removeMember(m: MemberDto): Promise<void> {
    const s = this.server();
    if (!s) return;
    if (!confirm(`Retirer ${m.username} des co-admins ?`)) return;
    await this.servers.removeMember(s.id, m.userId);
    this.members.set(await this.servers.listMembers(s.id));
  }

  protected async remove(): Promise<void> {
    const s = this.server();
    if (!s) return;
    // Confirmation forte : re-saisie du nom exact (action irréversible).
    const typed = prompt(
      `Suppression définitive de « ${s.name} » et de toutes ses données.\n` +
        `Tape le nom du serveur pour confirmer :`,
    );
    if (typed === null) return;
    if (typed.trim() !== s.name) {
      alert('Le nom ne correspond pas — suppression annulée.');
      return;
    }
    await this.servers.remove(s.id);
    await this.router.navigateByUrl('/me/servers');
  }

  /* ---------- RGPD : exclusions ---------- */

  private async loadExclusions(id: string): Promise<void> {
    this.excluded.set(new Set(await this.servers.listExclusions(id)));
  }

  protected isExcluded(uid: string): boolean {
    return this.excluded().has(uid);
  }

  protected async toggleExclusion(uid: string): Promise<void> {
    const s = this.server();
    if (!s) return;
    const next = new Set(this.excluded());
    if (next.has(uid)) {
      await this.servers.removeExclusion(s.id, uid);
      next.delete(uid);
    } else {
      if (
        !confirm(
          "Exclure ce joueur retire ses données des publications et purge l'historique du serveur. Continuer ?",
        )
      ) {
        return;
      }
      await this.servers.addExclusion(s.id, uid);
      next.add(uid);
    }
    this.excluded.set(next);
  }

  protected async purgeSnapshots(): Promise<void> {
    const s = this.server();
    if (!s) return;
    if (
      !confirm(
        "Purger tout l'historique de données de ce serveur ? Il sera reconstitué à la prochaine synchro.",
      )
    ) {
      return;
    }
    await this.servers.purgeSnapshots(s.id);
  }
}
