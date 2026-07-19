import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  TEST_WEB_ORIGIN,
  bootstrapTestApp,
  cleanupUsers,
  createServer,
  createUser,
  giveApiKey,
  validPalbox,
} from './helpers';

describe('RGPD : effacement & exclusions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const userIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, jwt } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await cleanupUsers(prisma, userIds);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('DELETE /auth/me supprime le compte et ses serveurs (cascade)', async () => {
    const u = await createUser(prisma, jwt);
    const s = await createServer(prisma, u.id);
    await http()
      .delete('/api/auth/me')
      .set('Cookie', u.cookie)
      .set('Origin', TEST_WEB_ORIGIN)
      .expect(200);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await prisma.server.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it('un joueur exclu est filtré des données ingérées', async () => {
    const owner = await createUser(prisma, jwt);
    userIds.push(owner.id);
    const s = await createServer(prisma, owner.id);
    const key = await giveApiKey(prisma, s.id);

    // exclut le joueur P1 (présent dans validPalbox)
    await http()
      .post(`/api/servers/${s.id}/exclusions`)
      .set('Cookie', owner.cookie)
      .set('Origin', TEST_WEB_ORIGIN)
      .send({ uid: 'P1' })
      .expect(201);

    await http()
      .post('/api/ingest/palbox')
      .set('Authorization', `Bearer ${key}`)
      .send(validPalbox('W_RGPD', 'rgpd-1'))
      .expect(201);

    const snap = await prisma.snapshot.findFirst({
      where: { serverId: s.id, kind: 'palbox' },
    });
    const payload = snap?.payload as {
      players: { uid: string }[];
      pals: { owner: string | null }[];
    };
    // P1 et ses pals ont disparu du snapshot stocké
    expect(payload.players.some((p) => p.uid === 'P1')).toBe(false);
    expect(payload.pals.some((p) => p.owner === 'P1')).toBe(false);
  });
});
