import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ApiKeyDto, ServerDto } from '@palhub/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createServerSchema,
  exclusionSchema,
  updateServerSchema,
  type CreateServerInput,
  type ExclusionInput,
  type UpdateServerInput,
} from './servers.dto';
import { ServersService } from './servers.service';

@Controller('servers')
@UseGuards(JwtAuthGuard)
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest): Promise<ServerDto[]> {
    const servers = await this.servers.listMine(req.userId);
    return servers.map((s) =>
      this.servers.toDto(s, this.servers.roleOf(s, req.userId)),
    );
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createServerSchema)) body: CreateServerInput,
  ): Promise<ServerDto> {
    return this.servers.toDto(
      await this.servers.create(req.userId, body),
      'owner',
    );
  }

  @Get(':id')
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<ServerDto> {
    const server = await this.servers.getMine(req.userId, id);
    return this.servers.toDto(server, this.servers.roleOf(server, req.userId));
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServerSchema)) body: UpdateServerInput,
  ): Promise<ServerDto> {
    const server = await this.servers.update(req.userId, id, body);
    return this.servers.toDto(server, this.servers.roleOf(server, req.userId));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.servers.remove(req.userId, id);
  }

  @Post(':id/api-key')
  rotateKey(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<ApiKeyDto> {
    return this.servers.rotateApiKey(req.userId, id);
  }

  /* ---------- RGPD : exclusions de joueurs & purge ---------- */

  @Get(':id/exclusions')
  exclusions(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<string[]> {
    return this.servers.listExclusions(req.userId, id);
  }

  @Post(':id/exclusions')
  async addExclusion(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(exclusionSchema)) body: ExclusionInput,
  ): Promise<{ ok: boolean }> {
    await this.servers.addExclusion(req.userId, id, body.uid);
    return { ok: true };
  }

  @Delete(':id/exclusions/:uid')
  @HttpCode(204)
  async removeExclusion(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('uid') uid: string,
  ): Promise<void> {
    await this.servers.removeExclusion(req.userId, id, uid);
  }

  @Post(':id/purge-snapshots')
  @HttpCode(204)
  async purge(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.servers.purgeSnapshots(req.userId, id);
  }
}
