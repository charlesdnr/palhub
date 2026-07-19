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
import { formatZodIssues } from '../common/zod-error';
import { PrismaService } from '../prisma/prisma.service';

/** Nombre de snapshots palbox conservés par serveur (les plus récents). */
const PALBOX_HISTORY = 30;
/** Rétention maximale (RGPD) : au-delà, un snapshot est purgé même s'il fait
 *  partie des 30 derniers. */
const PALBOX_MAX_AGE_MS = 90 * 24 * 3600_000;

export type SnapshotKind = 'palbox' | 'live';

@Injectable()
export class IngestService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    server: Server,
    kind: SnapshotKind,
    body: unknown,
  ): Promise<IngestResultDto> {
    const schema =
      kind === 'palbox' ? palboxSnapshotSchema : liveSnapshotSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: `Payload ${kind} invalide`,
        issues: formatZodIssues(parsed.error, 10),
      });
    }
    const payload = parsed.data;

    // La clé est verrouillée sur le monde vu au premier ingest.
    if (server.worldId && server.worldId !== payload.world_id) {
      throw new UnprocessableEntityException(
        `world_id inattendu (${payload.world_id}) : cette clé est liée au monde ${server.worldId}`,
      );
    }

    // RGPD : retire les joueurs exclus avant tout stockage.
    await this.applyExclusions(server.id, kind, payload);

    const sourceHash =
      payload.source_hash ??
      createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const generatedAt = new Date(payload.generated_at);

    if (kind === 'live') {
      // État instantané : un seul enregistrement par serveur, mis à jour en
      // place (évite le bloat de table/TOAST d'un delete+create à chaque ingest).
      const data = {
        sourceHash,
        generatedAt,
        payload: payload as unknown as Prisma.InputJsonValue,
      };
      const existing = await this.prisma.snapshot.findFirst({
        where: { serverId: server.id, kind: 'live' },
        select: { id: true },
        orderBy: { generatedAt: 'desc' },
      });
      if (existing) {
        await this.prisma.$transaction([
          // au cas où un doublon historique traînerait, on ne garde que celui-ci
          this.prisma.snapshot.deleteMany({
            where: {
              serverId: server.id,
              kind: 'live',
              id: { not: existing.id },
            },
          }),
          this.prisma.snapshot.update({ where: { id: existing.id }, data }),
        ]);
      } else {
        await this.prisma.snapshot.create({
          data: { serverId: server.id, kind, ...data },
        });
      }
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
          throw new ConflictException(
            'Snapshot déjà ingéré (source_hash identique)',
          );
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

  /** Retire du payload les joueurs exclus (RGPD) — modifie l'objet en place. */
  private async applyExclusions(
    serverId: string,
    kind: SnapshotKind,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const rows = await this.prisma.playerExclusion.findMany({
      where: { serverId },
      select: { uid: true },
    });
    if (!rows.length) return;
    const excluded = new Set(rows.map((r) => r.uid));

    const players = payload.players as { uid: string }[] | undefined;
    if (Array.isArray(players)) {
      payload.players = players.filter((p) => !excluded.has(p.uid));
    }
    if (kind === 'palbox') {
      const pals = payload.pals as { owner: string | null }[] | undefined;
      if (Array.isArray(pals)) {
        // les pals de base (owner null) restent ; ceux d'un joueur exclu partent
        payload.pals = pals.filter(
          (p) => p.owner === null || !excluded.has(p.owner),
        );
      }
    } else {
      const guilds = payload.guilds as { members: string[] }[] | undefined;
      if (Array.isArray(guilds)) {
        for (const g of guilds) {
          g.members = g.members.filter((uid) => !excluded.has(uid));
        }
      }
    }
  }

  private async purgeOldPalbox(serverId: string): Promise<void> {
    const keep = await this.prisma.snapshot.findMany({
      where: { serverId, kind: 'palbox' },
      orderBy: { generatedAt: 'desc' },
      take: PALBOX_HISTORY,
      select: { id: true },
    });
    const cutoff = new Date(Date.now() - PALBOX_MAX_AGE_MS);
    await this.prisma.snapshot.deleteMany({
      where: {
        serverId,
        kind: 'palbox',
        // purge si hors des 30 derniers OU plus vieux que la rétention max
        OR: [
          { id: { notIn: keep.map((s) => s.id) } },
          { generatedAt: { lt: cutoff } },
        ],
      },
    });
  }
}
