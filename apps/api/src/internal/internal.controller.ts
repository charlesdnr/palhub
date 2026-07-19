import {
  Body,
  Controller,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { IngestResultDto } from '@palhub/shared';
import { Prisma } from '@prisma/client';
import { decryptSecret } from '../common/crypto';
import { IngestService } from '../ingest/ingest.service';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InternalGuard } from './internal.guard';
import { reportSchema } from './internal.dto';
import type { ReportInput, SyncJob } from './internal.dto';

/** Colonnes brutes renvoyées par la requête de claim (snake_case Postgres). */
interface ClaimRow {
  server_id: string;
  host: string;
  port: number;
  username: string;
  auth_type: string;
  secret_enc: string;
  remote_path: string;
  last_stat_size: bigint | null;
  last_stat_mtime: bigint | null;
  host_key_fp: string | null;
}

@Controller('internal')
@UseGuards(InternalGuard)
export class InternalController {
  private readonly log = new Logger('InternalSync');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: IngestService,
  ) {}

  /** Réclame UN job (le plus ancien non verrouillé) et pose un verrou de 10 min.
   *  Le runner boucle sur cet endpoint : une fuite de trafic n'expose qu'un
   *  secret à la fois. Renvoie null quand il n'y a plus rien à faire. */
  @Post('sync-jobs/claim')
  async claim(): Promise<SyncJob | null> {
    // Sélection + verrouillage atomiques (FOR UPDATE SKIP LOCKED) : sûr même si
    // plusieurs runners tournent en parallèle.
    const rows = await this.prisma.$queryRaw<ClaimRow[]>(Prisma.sql`
      UPDATE sync_configs SET claimed_at = now()
      WHERE server_id = (
        SELECT server_id FROM sync_configs
        WHERE enabled = true
          AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')
        ORDER BY last_run_at ASC NULLS FIRST
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING server_id, host, port, username, auth_type, secret_enc,
                remote_path, last_stat_size, last_stat_mtime, host_key_fp
    `);
    const c = rows[0];
    if (!c) {
      return null;
    }
    this.log.log(`sync-jobs/claim : job ${c.server_id} réclamé`);
    return {
      serverId: c.server_id,
      host: c.host,
      port: c.port,
      username: c.username,
      authType: c.auth_type as 'password' | 'key',
      secret: decryptSecret(c.secret_enc),
      remotePath: c.remote_path,
      lastStatSize: c.last_stat_size === null ? null : Number(c.last_stat_size),
      lastStatMtime:
        c.last_stat_mtime === null ? null : Number(c.last_stat_mtime),
      hostKeyFp: c.host_key_fp,
    };
  }

  @Post('sync-jobs/:serverId/report')
  async report(
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(reportSchema)) body: ReportInput,
  ): Promise<{ ok: boolean }> {
    // updateMany : si l'admin a supprimé sa config entre-temps, 0 ligne mise à
    // jour plutôt qu'un 500 (P2025).
    const res = await this.prisma.syncConfig.updateMany({
      where: { serverId },
      data: {
        lastRunAt: new Date(),
        lastStatus: body.status,
        lastError: body.error ?? null,
        // NB : on ne remet PAS claimedAt à null. Le verrou de 10 min sert de
        // « déjà traité ce cycle » ; il expire avant le prochain run du cron
        // (~12 min), qui re-réclamera alors le job. Sans ça, le runner
        // re-réclamerait le même job en boucle dans un même run.
        ...(body.statSize != null
          ? { lastStatSize: BigInt(body.statSize) }
          : {}),
        ...(body.statMtime != null
          ? { lastStatMtime: BigInt(body.statMtime) }
          : {}),
      },
    });
    // TOFU : on n'enregistre l'empreinte que la première fois (host_key_fp NULL),
    // jamais on ne l'écrase — un changement d'hôte se règle via la config.
    if (body.hostKeyFp) {
      await this.prisma.syncConfig.updateMany({
        where: { serverId, hostKeyFp: null },
        data: { hostKeyFp: body.hostKeyFp },
      });
    }
    if (body.status === 'error') {
      this.log.warn(`sync ${serverId} : erreur signalée — ${body.error ?? ''}`);
    }
    return { ok: res.count > 0 };
  }

  @Post('ingest/:serverId/:kind')
  async ingestFor(
    @Param('serverId') serverId: string,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ): Promise<IngestResultDto> {
    if (kind !== 'palbox' && kind !== 'live') {
      throw new NotFoundException('kind inconnu');
    }
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException('Serveur inconnu');
    }
    return this.ingest.ingest(server, kind, body);
  }
}
