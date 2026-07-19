import { Injectable, NotFoundException } from '@nestjs/common';
import type { PublicServerDto } from '@palhub/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { SnapshotKind } from '../ingest/ingest.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async listListed(): Promise<PublicServerDto[]> {
    const servers = await this.prisma.server.findMany({
      where: { visibility: 'public' },
      orderBy: { lastIngestAt: { sort: 'desc', nulls: 'last' } },
      take: 100,
    });
    return servers.map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      lastIngestAt: s.lastIngestAt?.toISOString() ?? null,
    }));
  }

  async getBySlug(slug: string): Promise<PublicServerDto> {
    const s = await this.prisma.server.findUnique({ where: { slug } });
    if (!s || s.visibility === 'private') {
      throw new NotFoundException('Serveur inconnu');
    }
    return {
      slug: s.slug,
      name: s.name,
      description: s.description,
      lastIngestAt: s.lastIngestAt?.toISOString() ?? null,
    };
  }

  async latestPayload(
    slug: string,
    kind: SnapshotKind,
  ): Promise<{ payload: unknown; sourceHash: string }> {
    const server = await this.prisma.server.findUnique({ where: { slug } });
    if (!server || server.visibility === 'private') {
      throw new NotFoundException('Serveur inconnu');
    }
    const snapshot = await this.prisma.snapshot.findFirst({
      where: { serverId: server.id, kind },
      orderBy: { generatedAt: 'desc' },
    });
    if (!snapshot) {
      throw new NotFoundException(`Aucune donnée ${kind} pour ce serveur`);
    }
    return { payload: snapshot.payload, sourceHash: snapshot.sourceHash };
  }
}
