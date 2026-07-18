import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { IngestResultDto } from '@palhub/shared';
import { ApiKeyGuard } from './api-key.guard';
import type { IngestRequest } from './api-key.guard';
import { IngestService } from './ingest.service';

@Controller('ingest')
@UseGuards(ApiKeyGuard)
@Throttle({ default: { ttl: 60_000, limit: 12 } })
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('palbox')
  palbox(
    @Req() req: IngestRequest,
    @Body() body: unknown,
  ): Promise<IngestResultDto> {
    return this.ingest.ingest(req.server, 'palbox', body);
  }

  @Post('live')
  live(
    @Req() req: IngestRequest,
    @Body() body: unknown,
  ): Promise<IngestResultDto> {
    return this.ingest.ingest(req.server, 'live', body);
  }
}
