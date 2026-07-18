import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Server } from '@prisma/client';
import {
  liveSnapshotSchema,
  palboxSnapshotSchema,
  type IngestResultDto,
} from '@palhub/shared';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Nombre de snapshots palbox conservés par serveur (les plus récents). */
const PALBOX_HISTORY = 30;

export type SnapshotKind = 'palbox' | 'live';

@Injectable()
export class IngestService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    server: Server,
    kind: SnapshotKind,
    body: unknown,
  ): Promise<IngestResultDto> {
    const schema = kind === 'palbox' ? palboxSnapshotSchema : liveSnapshotSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: `Payload ${kind} invalide`,
        issues: parsed.error.issues
          .slice(0, 10)
          .map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const payload = parsed.data;

    // La clé est verrouillée sur le monde vu au premier ingest.
    if (server.worldId && server.worldId !== payload.world_id) {
      throw new UnprocessableEntityException(
        `world_id inattendu (${payload.world_id}) : cette clé est liée au monde ${server.worldId}`,
      );
    }

    const sourceHash =
      payload.source_hash ??
      createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const generatedAt = new Date(payload.generated_at);

    if (kind === 'live') {
      // État instantané : on ne garde qu'un enregistrement par serveur.
      await this.prisma.$transaction([
        this.prisma.snapshot.deleteMany({
          where: { serverId: server.id, kind: 'live' },
        }),
        this.prisma.snapshot.create({
          data: {
            serverId: server.id,
            kind,
            sourceHash,
            generatedAt,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        }),
      ]);
    } else {
      try {
        await this.prisma.snapshot.create({
          data: {
            serverId: server.id,
            kind,
            sourceHash,
            generatedAt,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Snapshot déjà ingéré (source_hash identique)');
        }
        throw e;
      }
      await this.purgeOldPalbox(server.id);
    }

    await this.prisma.server.update({
      where: { id: server.id },
      data: {
        lastIngestAt: new Date(),
        ...(server.worldId ? {} : { worldId: payload.world_id }),
      },
    });

    return { stored: true, kind, sourceHash };
  }

  private async purgeOldPalbox(serverId: string): Promise<void> {
    const keep = await this.prisma.snapshot.findMany({
      where: { serverId, kind: 'palbox' },
      orderBy: { generatedAt: 'desc' },
      take: PALBOX_HISTORY,
      select: { id: true },
    });
    await this.prisma.snapshot.deleteMany({
      where: {
        serverId,
        kind: 'palbox',
        id: { notIn: keep.map((s) => s.id) },
      },
    });
  }
}
