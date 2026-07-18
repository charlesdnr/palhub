import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Server } from '@prisma/client';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashApiKey } from '../servers/servers.service';

const KEY_RE = /^Bearer (pal_([0-9a-f]{8})_[0-9a-f]{32})$/;

export interface IngestRequest extends Request {
  server: Server;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<IngestRequest>();
    const match = KEY_RE.exec(req.headers.authorization ?? '');
    if (!match) {
      throw new UnauthorizedException('Clé API manquante ou mal formée');
    }
    const [, key, prefix] = match;

    const server = await this.prisma.server.findFirst({
      where: { apiKeyPrefix: prefix },
    });
    if (!server?.apiKeyHash) {
      throw new UnauthorizedException('Clé API inconnue');
    }

    const given = Buffer.from(hashApiKey(key));
    const stored = Buffer.from(server.apiKeyHash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      throw new UnauthorizedException('Clé API invalide');
    }

    req.server = server;
    return true;
  }
}
