import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { UserDto } from '@palhub/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AUTH_COOKIE, JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from './jwt-auth.guard';

const STATE_COOKIE = 'ph_state';
const NEXT_COOKIE = 'ph_next';

function cookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('discord')
  discord(@Query('next') next: string | undefined, @Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, state, cookieOptions(10 * 60_000));
    // retour post-login (ex : page d'invitation). Chemin relatif uniquement,
    // pour ne pas servir de redirection ouverte.
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      res.cookie(NEXT_COOKIE, next, cookieOptions(10 * 60_000));
    }
    res.redirect(this.auth.authorizeUrl(state));
  }

  @Get('discord/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const expected = (req.cookies as Record<string, string> | undefined)?.[
      STATE_COOKIE
    ];
    if (!code || !state || !expected || state !== expected) {
      throw new UnauthorizedException('State OAuth invalide');
    }
    res.clearCookie(STATE_COOKIE, { path: '/' });

    const user = await this.auth.loginWithCode(code);
    res.cookie(
      AUTH_COOKIE,
      this.auth.signToken(user.id, user.tokenVersion),
      cookieOptions(7 * 24 * 3600_000),
    );
    const cookies = req.cookies as Record<string, string> | undefined;
    const next = cookies?.[NEXT_COOKIE];
    res.clearCookie(NEXT_COOKIE, { path: '/' });
    const dest =
      next && next.startsWith('/') && !next.startsWith('//')
        ? next
        : '/me/servers';
    res.redirect(`${process.env.WEB_ORIGIN ?? ''}${dest}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: req.userId },
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur inconnu');
    }
    return {
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      avatarUrl: user.avatarUrl,
    };
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    res.json({ ok: true });
  }

  /** Déconnecte toutes les sessions : invalide tous les JWT déjà émis. */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    await this.prisma.user.update({
      where: { id: req.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    res.json({ ok: true });
  }
}
