import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  InviteDto,
  InviteInfoDto,
  MemberDto,
  ServerDto,
} from '@palhub/shared';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ServersService } from './servers.service';

const INVITE_TTL_MS = 7 * 24 * 3600_000; // 7 jours

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
  ) {}

  /** Crée ou remplace LE lien d'invitation du serveur (l'ancien devient invalide). */
  async rotate(userId: string, serverId: string): Promise<InviteDto> {
    await this.servers.getOwned(userId, serverId);
    // Ménage opportuniste : purge les invitations expirées de la plateforme.
    await this.prisma.serverInvite.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invite = await this.prisma.serverInvite.upsert({
      where: { serverId },
      create: { token, serverId, expiresAt },
      update: { token, expiresAt },
    });
    return { token: invite.token, expiresAt: invite.expiresAt.toISOString() };
  }

  async get(userId: string, serverId: string): Promise<InviteDto | null> {
    await this.servers.getOwned(userId, serverId);
    const invite = await this.prisma.serverInvite.findUnique({
      where: { serverId },
    });
    if (!invite || invite.expiresAt < new Date()) return null;
    return { token: invite.token, expiresAt: invite.expiresAt.toISOString() };
  }

  async revoke(userId: string, serverId: string): Promise<void> {
    await this.servers.getOwned(userId, serverId);
    await this.prisma.serverInvite.deleteMany({ where: { serverId } });
  }

  /** Infos publiques d'un lien (page d'acceptation, avant login). */
  async info(token: string): Promise<InviteInfoDto> {
    const invite = await this.prisma.serverInvite.findUnique({
      where: { token },
      include: { server: true },
    });
    if (!invite) {
      throw new NotFoundException('Invitation inconnue ou révoquée');
    }
    return {
      serverName: invite.server.name,
      slug: invite.server.slug,
      expired: invite.expiresAt < new Date(),
    };
  }

  /** Accepte l'invitation : l'utilisateur devient co-admin du serveur. */
  async accept(userId: string, token: string): Promise<ServerDto> {
    const invite = await this.prisma.serverInvite.findUnique({
      where: { token },
      include: { server: true },
    });
    if (!invite) {
      throw new NotFoundException('Invitation inconnue ou révoquée');
    }
    if (invite.expiresAt < new Date()) {
      throw new GoneException('Invitation expirée — demande un nouveau lien');
    }
    if (invite.server.ownerId === userId) {
      return this.servers.toDto(invite.server, 'owner');
    }
    await this.prisma.serverMember.upsert({
      where: { serverId_userId: { serverId: invite.serverId, userId } },
      create: { serverId: invite.serverId, userId },
      update: {},
    });
    return this.servers.toDto(invite.server, 'admin');
  }

  /** Propriétaire + co-admins, pour l'écran de gestion. */
  async members(userId: string, serverId: string): Promise<MemberDto[]> {
    const server = await this.servers.getMine(userId, serverId);
    const owner = await this.prisma.user.findUnique({
      where: { id: server.ownerId },
    });
    const members = await this.prisma.serverMember.findMany({
      where: { serverId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    const out: MemberDto[] = [];
    if (owner) {
      out.push({
        userId: owner.id,
        username: owner.username,
        avatarUrl: owner.avatarUrl,
        role: 'owner',
      });
    }
    for (const m of members) {
      out.push({
        userId: m.userId,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        role: 'admin',
      });
    }
    return out;
  }

  /** Le propriétaire retire n'importe quel co-admin ; un co-admin peut se retirer lui-même. */
  async removeMember(
    userId: string,
    serverId: string,
    targetId: string,
  ): Promise<void> {
    const server = await this.servers.getMine(userId, serverId);
    if (targetId === server.ownerId) {
      throw new ForbiddenException('Le propriétaire ne peut pas être retiré');
    }
    if (userId !== server.ownerId && userId !== targetId) {
      throw new ForbiddenException(
        'Seul le propriétaire retire les autres membres',
      );
    }
    await this.prisma.serverMember.deleteMany({
      where: { serverId, userId: targetId },
    });
  }
}
