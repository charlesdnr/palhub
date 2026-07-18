import {
  ConflictException,
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

@Injectable()
export class ServersService {
  constructor(private readonly prisma: PrismaService) {}

  toDto(server: Server): ServerDto {
    return {
      id: server.id,
      slug: server.slug,
      name: server.name,
      description: server.description,
      isListed: server.isListed,
      worldId: server.worldId,
      apiKeyPrefix: server.apiKeyPrefix,
      lastIngestAt: server.lastIngestAt?.toISOString() ?? null,
      createdAt: server.createdAt.toISOString(),
    };
  }

  listMine(ownerId: string): Promise<Server[]> {
    return this.prisma.server.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Renvoie le serveur ou 404 — un serveur d'un autre owner est invisible (pas de 403 bavard). */
  async getMine(ownerId: string, id: string): Promise<Server> {
    const server = await this.prisma.server.findFirst({
      where: { id, ownerId },
    });
    if (!server) {
      throw new NotFoundException('Serveur introuvable');
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
    ownerId: string,
    id: string,
    input: UpdateServerInput,
  ): Promise<Server> {
    await this.getMine(ownerId, id);
    return this.prisma.server.update({ where: { id }, data: input });
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.getMine(ownerId, id);
    await this.prisma.server.delete({ where: { id } });
  }

  /** Génère (ou remplace) la clé API. La clé complète n'est renvoyée qu'ici. */
  async rotateApiKey(ownerId: string, id: string): Promise<ApiKeyDto> {
    await this.getMine(ownerId, id);
    const prefix = randomBytes(4).toString('hex');
    const secret = randomBytes(16).toString('hex');
    const apiKey = `pal_${prefix}_${secret}`;
    await this.prisma.server.update({
      where: { id },
      data: { apiKeyPrefix: prefix, apiKeyHash: hashApiKey(apiKey) },
    });
    return { apiKey, apiKeyPrefix: prefix };
  }
}
