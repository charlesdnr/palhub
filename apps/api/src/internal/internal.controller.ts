import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { IngestResultDto } from '@palhub/shared';
import { decryptSecret } from '../common/crypto';
import { IngestService } from '../ingest/ingest.service';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InternalGuard } from './internal.guard';
import { reportSchema } from './internal.dto';
import type { ReportInput, SyncJob } from './internal.dto';

@Controller('internal')
@UseGuards(InternalGuard)
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: IngestService,
  ) {}

  /** Liste des serveurs à synchroniser (secrets déchiffrés — réservé au runner). */
  @Get('sync-jobs')
  async jobs(): Promise<SyncJob[]> {
    const configs = await this.prisma.syncConfig.findMany({
      where: { enabled: true },
    });
    return configs.map((c) => ({
      serverId: c.serverId,
      host: c.host,
      port: c.port,
      username: c.username,
      authType: c.authType as 'password' | 'key',
      secret: decryptSecret(c.secretEnc),
      remotePath: c.remotePath,
      lastStatSize: c.lastStatSize,
      lastStatMtime: c.lastStatMtime,
    }));
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
        ...(body.statSize != null ? { lastStatSize: body.statSize } : {}),
        ...(body.statMtime != null ? { lastStatMtime: body.statMtime } : {}),
      },
    });
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
