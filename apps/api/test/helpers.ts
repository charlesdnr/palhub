import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './../src/app.module';
import { AUTH_COOKIE } from './../src/auth/jwt-auth.guard';
import { PrismaService } from './../src/prisma/prisma.service';
import { hashApiKey } from './../src/servers/servers.service';

/** Monte l'app Nest comme main.ts (préfixe api, cookies, body json). */
export async function bootstrapTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  jwt: JwtService;
}> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication({ bodyParser: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(json({ limit: '8mb' }));
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    jwt: app.get(JwtService),
  };
}

let seq = 0;
/** Suffixe unique par appel, sans Date.now (déterministe dans un run). */
function uniq(): string {
  seq += 1;
  return `${process.pid}${seq}`;
}

export interface SeededUser {
  id: string;
  cookie: string;
}

export async function createUser(
  prisma: PrismaService,
  jwt: JwtService,
): Promise<SeededUser> {
  const user = await prisma.user.create({
    data: { discordId: `test-${uniq()}`, username: `u${uniq()}` },
  });
  const token = jwt.sign({ sub: user.id });
  return { id: user.id, cookie: `${AUTH_COOKIE}=${token}` };
}

export async function createServer(
  prisma: PrismaService,
  ownerId: string,
): Promise<{ id: string; slug: string }> {
  const slug = `srv-${uniq()}`;
  const server = await prisma.server.create({
    data: { ownerId, name: `Serveur ${slug}`, slug },
  });
  return { id: server.id, slug: server.slug };
}

/** Pose une clé API sur un serveur et renvoie la clé en clair. */
export async function giveApiKey(
  prisma: PrismaService,
  serverId: string,
): Promise<string> {
  const prefix = uniq().padStart(8, '0').slice(0, 8);
  const apiKey = `pal_${prefix}_${'a'.repeat(32)}`;
  await prisma.server.update({
    where: { id: serverId },
    data: { apiKeyPrefix: prefix, apiKeyHash: hashApiKey(apiKey) },
  });
  return apiKey;
}

/** Supprime les users de test (cascade sur serveurs/snapshots/…). */
export async function cleanupUsers(
  prisma: PrismaService,
  ids: string[],
): Promise<void> {
  if (ids.length) {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

export function validPalbox(worldId = 'WORLD_TEST_1', hash = 'h1') {
  return {
    generated_at: new Date().toISOString(),
    source_hash: hash,
    world_id: worldId,
    passive_ranks: {},
    players: [{ uid: 'P1', name: 'Alice', level: 10 }],
    pals: [
      {
        id: 'pal-1',
        owner: 'P1',
        species: 'Lamball',
        species_id: 'SheepBall',
        nickname: null,
        level: 5,
        rank: 1,
        gender: 'female',
        lucky: false,
        alpha: false,
        ivs: { hp: 50, shot: 40, defense: 30 },
        passives: [],
        container: null,
        slot: 0,
      },
    ],
  };
}
