import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  SeededUser,
  bootstrapTestApp,
  cleanupUsers,
  createServer,
  createUser,
  giveApiKey,
  validPalbox,
} from './helpers';

describe('Ingestion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const userIds: string[] = [];

  let owner: SeededUser;
  let server: { id: string; slug: string };
  let apiKey: string;

  beforeAll(async () => {
    ({ app, prisma, jwt } = await bootstrapTestApp());
    owner = await createUser(prisma, jwt);
    userIds.push(owner.id);
    server = await createServer(prisma, owner.id);
    apiKey = await giveApiKey(prisma, server.id);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, userIds);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = () => ({ Authorization: `Bearer ${apiKey}` });

  it('clé mal formée → 401', () =>
    http()
      .post('/api/ingest/palbox')
      .set('Authorization', 'Bearer not-a-key')
      .send(validPalbox())
      .expect(401));

  it('payload valide → 201 et verrouille le world_id', async () => {
    const res = await http()
      .post('/api/ingest/palbox')
      .set(bearer())
      .send(validPalbox('WORLD_LOCK', 'hash-a'))
      .expect(201);
    expect(res.body.stored).toBe(true);

    const s = await prisma.server.findUnique({ where: { id: server.id } });
    expect(s?.worldId).toBe('WORLD_LOCK');
  });

  it('world_id différent après verrou → 422', () =>
    http()
      .post('/api/ingest/palbox')
      .set(bearer())
      .send(validPalbox('AUTRE_MONDE', 'hash-b'))
      .expect(422));

  it('même source_hash → 409 (idempotence)', () =>
    http()
      .post('/api/ingest/palbox')
      .set(bearer())
      .send(validPalbox('WORLD_LOCK', 'hash-a'))
      .expect(409));

  it('payload invalide → 400 avec issues', async () => {
    const res = await http()
      .post('/api/ingest/palbox')
      .set(bearer())
      .send({ world_id: 'WORLD_LOCK' })
      .expect(400);
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('live : ne conserve qu’un seul enregistrement (update en place)', async () => {
    // s appartient à owner : nettoyé en cascade en fin de suite.
    const s = await createServer(prisma, owner.id);
    const key = await giveApiKey(prisma, s.id);
    const live = (hash: string) => ({
      generated_at: new Date().toISOString(),
      source_hash: hash,
      world_id: 'W_LIVE',
      guilds: [],
      bases: [],
      players: [],
    });
    await request(app.getHttpServer())
      .post('/api/ingest/live')
      .set('Authorization', `Bearer ${key}`)
      .send(live('live-1'))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/ingest/live')
      .set('Authorization', `Bearer ${key}`)
      .send(live('live-2'))
      .expect(201);
    const count = await prisma.snapshot.count({
      where: { serverId: s.id, kind: 'live' },
    });
    expect(count).toBe(1);
    const only = await prisma.snapshot.findFirst({
      where: { serverId: s.id, kind: 'live' },
    });
    expect(only?.sourceHash).toBe('live-2');
  });

  it('purge : ne conserve que les 30 derniers snapshots palbox', async () => {
    // Le throttle d'ingest (12/min) empêche 30+ POST rapides : on seed
    // directement 31 snapshots RÉCENTS (la rétention 90 j purgerait des dates
    // trop anciennes), puis un ingest réel déclenche la purge par nombre.
    const base = Date.now() - 32 * 60_000;
    for (let i = 0; i < 31; i++) {
      await prisma.snapshot.create({
        data: {
          serverId: server.id,
          kind: 'palbox',
          sourceHash: `seed-${i}`,
          generatedAt: new Date(base + i * 60_000),
          payload: {},
        },
      });
    }
    await http()
      .post('/api/ingest/palbox')
      .set(bearer())
      .send(validPalbox('WORLD_LOCK', 'purge-trigger'))
      .expect(201);

    const count = await prisma.snapshot.count({
      where: { serverId: server.id, kind: 'palbox' },
    });
    expect(count).toBe(30);
  });
});
