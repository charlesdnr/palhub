import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

/** Protège les routes /api/internal/* : réservées au runner de sync hébergée. */
@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.WORKER_SECRET ?? '';
    if (secret.length < 32) {
      throw new UnauthorizedException('Sync hébergée non configurée');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const given = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const a = Buffer.from(given);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Secret invalide');
    }
    return true;
  }
}
