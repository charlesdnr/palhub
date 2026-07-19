import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  InviteDto,
  InviteInfoDto,
  MemberDto,
  ServerDto,
} from '@palhub/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { InvitesService } from './invites.service';

@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  // --- gestion par le propriétaire ---

  @Get('servers/:id/invite')
  @UseGuards(JwtAuthGuard)
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<InviteDto | null> {
    return this.invites.get(req.userId, id);
  }

  @Post('servers/:id/invite')
  @UseGuards(JwtAuthGuard)
  rotate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<InviteDto> {
    return this.invites.rotate(req.userId, id);
  }

  @Delete('servers/:id/invite')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.invites.revoke(req.userId, id);
  }

  @Get('servers/:id/members')
  @UseGuards(JwtAuthGuard)
  members(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<MemberDto[]> {
    return this.invites.members(req.userId, id);
  }

  @Delete('servers/:id/members/:userId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.invites.removeMember(req.userId, id, userId);
  }

  // --- côté invité ---

  /** Infos publiques du lien (affichées avant login). */
  @Get('public/invites/:token')
  info(@Param('token') token: string): Promise<InviteInfoDto> {
    return this.invites.info(token);
  }

  @Post('invites/:token/accept')
  @UseGuards(JwtAuthGuard)
  accept(
    @Req() req: AuthenticatedRequest,
    @Param('token') token: string,
  ): Promise<ServerDto> {
    return this.invites.accept(req.userId, token);
  }
}
