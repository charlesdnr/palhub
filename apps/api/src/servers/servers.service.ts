import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Server } from '@prisma/client';
import type { ApiKeyDto, ServerDto } from '@palhub/shared';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServerInput, UpdateServerInput } from './servers.dto';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export type ServerRole = 'owner' | 'admin';

@Injectable()
export class ServersService {
  constructor(private readonly prisma: PrismaService) {}

  toDto(server: Server, role: ServerRole): ServerDto {
    return {
      id: server.id,
      slug: server.slug,
      name: server.name,
      description: server.description,
      isListed: server.isListed,
      worldId: server.worldId,
      // la clé API est l'affaire du propriétaire
      apiKeyPrefix: role === 'owner' ? server.apiKeyPrefix : null,
      lastIngestAt: server.lastIngestAt?.toISOString() ?? null,
      createdAt: server.createdAt.toISOString(),
      role,
    };
  }

  roleOf(server: Server, userId: string): ServerRole {
    return server.ownerId === userId ? 'owner' : 'admin';
  }

  /** Serveurs possédés + serveurs où l'on est co-admin. */
  listMine(userId: string): Promise<Server[]> {
    return this.prisma.server.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Renvoie le serveur si owner OU co-admin — 404 sinon (pas de 403 bavard). */
  async getMine(userId: string, id: string): Promise<Server> {
    const server = await this.prisma.server.findFirst({
      where: {
        id,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    });
    if (!server) {
      throw new NotFoundException('Serveur introuvable');
    }
    return server;
  }

  /** Réservé au propriétaire (clé API, suppression, invitations). */
  async getOwned(userId: string, id: string): Promise<Server> {
    const server = await this.getMine(userId, id);
    if (server.ownerId !== userId) {
      throw new ForbiddenException('Réservé au propriétaire du serveur');
    }
    return server;
  }

  async create(ownerId: string, input: CreateServerInput): Promise<Server> {
    try {
      return await this.prisma.server.create({
        data: {
          ownerId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Ce slug est déjà pris');
      }
      throw e;
    }
  }

  async update(
    userId: string,
    id: string,
    input: UpdateServerInput,
  ): Promise<Server> {
    await this.getMine(userId, id);
    return this.prisma.server.update({ where: { id }, data: input });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.server.delete({ where: { id } });
  }

  /** Génère (ou remplace) la clé API. La clé complète n'est renvoyée qu'ici. */
  async rotateApiKey(userId: string, id: string): Promise<ApiKeyDto> {
    await this.getOwned(userId, id);
    // apiKeyPrefix est @unique : en cas de collision (P2002), on régénère.
    for (let attempt = 0; attempt < 5; attempt++) {
      const prefix = randomBytes(4).toString('hex');
      const secret = randomBytes(16).toString('hex');
      const apiKey = `pal_${prefix}_${secret}`;
      try {
        await this.prisma.server.update({
          where: { id },
          data: { apiKeyPrefix: prefix, apiKeyHash: hashApiKey(apiKey) },
        });
        return { apiKey, apiKeyPrefix: prefix };
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new ConflictException(
      'Impossible de générer une clé unique, réessaie',
    );
  }
}
