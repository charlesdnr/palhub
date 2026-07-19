import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export const AUTH_COOKIE = 'ph_token';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[
      AUTH_COOKIE
    ];
    if (!token) {
      throw new UnauthorizedException('Non connecté');
    }
    let payload: { sub: string; ver?: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; ver?: number }>(
        token,
      );
    } catch {
      throw new UnauthorizedException('Session expirée');
    }
    // Révocation : le token doit porter la version courante de l'utilisateur.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true },
    });
    if (!user || user.tokenVersion !== (payload.ver ?? 0)) {
      throw new UnauthorizedException('Session révoquée');
    }
    req.userId = payload.sub;
    return true;
  }
}
