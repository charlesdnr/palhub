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
  updateServerSchema,
  type CreateServerInput,
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
    return servers.map((s) => this.servers.toDto(s));
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createServerSchema)) body: CreateServerInput,
  ): Promise<ServerDto> {
    return this.servers.toDto(await this.servers.create(req.userId, body));
  }

  @Get(':id')
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<ServerDto> {
    return this.servers.toDto(await this.servers.getMine(req.userId, id));
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServerSchema)) body: UpdateServerInput,
  ): Promise<ServerDto> {
    return this.servers.toDto(await this.servers.update(req.userId, id, body));
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
}
