import { Controller, Get, Header, Param } from '@nestjs/common';
import type { PublicServerDto } from '@palhub/shared';
import { PublicService } from './public.service';

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
  @Header('Cache-Control', 'public, max-age=60')
  palbox(@Param('slug') slug: string): Promise<unknown> {
    return this.pub.latestPayload(slug, 'palbox');
  }

  @Get('s/:slug/live')
  @Header('Cache-Control', 'public, max-age=30')
  live(@Param('slug') slug: string): Promise<unknown> {
    return this.pub.latestPayload(slug, 'live');
  }
}
