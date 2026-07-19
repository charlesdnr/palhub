import { Controller, Get, Header, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PublicServerDto } from '@palhub/shared';
import { PublicService } from './public.service';
import type { SnapshotKind } from '../ingest/ingest.service';

@Controller('public')
export class PublicController {
  constructor(private readonly pub: PublicService) {}

  @Get('servers')
  @Header('Cache-Control', 'public, max-age=60')
  servers(): Promise<PublicServerDto[]> {
    return this.pub.listListed();
  }

  @Get('s/:slug')
  @Header('Cache-Control', 'public, max-age=60')
  server(@Param('slug') slug: string): Promise<PublicServerDto> {
    return this.pub.getBySlug(slug);
  }

  @Get('s/:slug/palbox')
  palbox(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.sendPayload(slug, 'palbox', 60, req, res);
  }

  @Get('s/:slug/live')
  live(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.sendPayload(slug, 'live', 30, req, res);
  }

  /** Renvoie le payload avec un ETag (= source_hash) ; 304 si inchangé. */
  private async sendPayload(
    slug: string,
    kind: SnapshotKind,
    maxAge: number,
    req: Request,
    res: Response,
  ): Promise<void> {
    const { payload, sourceHash } = await this.pub.latestPayload(slug, kind);
    const etag = `"${sourceHash}"`;
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.json(payload);
  }
}
