import { BadRequestException, Injectable } from '@nestjs/common';
import type { SyncConfig } from '@prisma/client';
import type { SyncConfigDto } from '@palhub/shared';
import { encryptSecret } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { PutSyncConfigInput } from './sync.dto';
import { ServersService } from './servers.service';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
  ) {}

  toDto(config: SyncConfig): SyncConfigDto {
    return {
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType as 'password' | 'key',
      remotePath: config.remotePath,
      enabled: config.enabled,
      hasSecret: true,
      hostKeyFp: config.hostKeyFp,
      lastRunAt: config.lastRunAt?.toISOString() ?? null,
      lastStatus: config.lastStatus as SyncConfigDto['lastStatus'],
      lastError: config.lastError,
    };
  }

  async get(ownerId: string, serverId: string): Promise<SyncConfigDto | null> {
    await this.servers.getMine(ownerId, serverId);
    const config = await this.prisma.syncConfig.findUnique({
      where: { serverId },
    });
    return config ? this.toDto(config) : null;
  }

  async put(
    ownerId: string,
    serverId: string,
    input: PutSyncConfigInput,
  ): Promise<SyncConfigDto> {
    await this.servers.getMine(ownerId, serverId);
    const existing = await this.prisma.syncConfig.findUnique({
      where: { serverId },
    });
    if (!input.secret && !existing) {
      throw new BadRequestException(
        'Le mot de passe ou la clé privée est requis à la création',
      );
    }
    const secretEnc = input.secret
      ? encryptSecret(input.secret)
      : existing!.secretEnc;
    // Si l'hôte ou le port change, l'empreinte mémorisée n'a plus de sens :
    // on la réinitialise pour ré-apprendre la clé (TOFU) à la prochaine connexion.
    const hostChanged =
      !existing || existing.host !== input.host || existing.port !== input.port;
    const data = {
      host: input.host,
      port: input.port,
      username: input.username,
      authType: input.authType,
      remotePath: input.remotePath.replace(/\/+$/, ''),
      enabled: input.enabled,
      secretEnc,
      ...(hostChanged ? { hostKeyFp: null } : {}),
      // nouvelle config = nouveau départ pour la détection de changement
      lastStatSize: null,
      lastStatMtime: null,
      lastStatus: null,
      lastError: null,
    };
    const config = await this.prisma.syncConfig.upsert({
      where: { serverId },
      create: { serverId, ...data },
      update: data,
    });
    return this.toDto(config);
  }

  /** Oublie l'empreinte de la clé d'hôte : ré-apprise à la prochaine sync. */
  async resetHostKey(ownerId: string, serverId: string): Promise<void> {
    await this.servers.getMine(ownerId, serverId);
    await this.prisma.syncConfig.updateMany({
      where: { serverId },
      data: { hostKeyFp: null },
    });
  }

  async remove(ownerId: string, serverId: string): Promise<void> {
    await this.servers.getMine(ownerId, serverId);
    await this.prisma.syncConfig.deleteMany({ where: { serverId } });
  }
}
