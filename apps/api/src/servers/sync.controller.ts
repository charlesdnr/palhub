import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { SyncConfigDto } from '@palhub/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { putSyncConfigSchema } from './sync.dto';
import type { PutSyncConfigInput } from './sync.dto';
import { SyncService } from './sync.service';

@Controller('servers/:id/sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<SyncConfigDto | null> {
    return this.sync.get(req.userId, id);
  }

  @Put()
  put(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(putSyncConfigSchema)) body: PutSyncConfigInput,
  ): Promise<SyncConfigDto> {
    return this.sync.put(req.userId, id, body);
  }

  @Delete()
  @HttpCode(204)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.sync.remove(req.userId, id);
  }

  /** Réinitialise l'empreinte de la clé d'hôte (changement de serveur légitime). */
  @Delete('host-key')
  @HttpCode(204)
  async resetHostKey(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.sync.resetHostKey(req.userId, id);
  }
}
