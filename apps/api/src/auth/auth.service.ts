import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
const DISCORD_ME = 'https://discord.com/api/users/@me';

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? '',
      response_type: 'code',
      scope: 'identify',
      redirect_uri: process.env.DISCORD_CALLBACK_URL ?? '',
      state,
    });
    return `${DISCORD_AUTHORIZE}?${params}`;
  }

  /** Échange le code OAuth, récupère le profil Discord et upsert l'utilisateur. */
  async loginWithCode(code: string): Promise<User> {
    const tokenRes = await fetch(DISCORD_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_CALLBACK_URL ?? '',
      }),
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException('Échange du code Discord refusé');
    }
    const { access_token } = (await tokenRes.json()) as {
      access_token?: string;
    };
    if (!access_token) {
      throw new InternalServerErrorException('Réponse Discord sans token');
    }

    const meRes = await fetch(DISCORD_ME, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) {
      throw new UnauthorizedException('Profil Discord inaccessible');
    }
    const me = (await meRes.json()) as DiscordUser;

    const username = me.global_name ?? me.username;
    const avatarUrl = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
      : null;

    return this.prisma.user.upsert({
      where: { discordId: me.id },
      create: { discordId: me.id, username, avatarUrl },
      update: { username, avatarUrl },
    });
  }

  signToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }
}
