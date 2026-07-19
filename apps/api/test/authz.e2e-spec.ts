import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  SeededUser,
  TEST_WEB_ORIGIN,
  bootstrapTestApp,
  cleanupUsers,
  createServer,
  createUser,
} from './helpers';

describe('Autorisation serveurs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const userIds: string[] = [];

  let owner: SeededUser;
  let coAdmin: SeededUser;
  let outsider: SeededUser;
  let server: { id: string; slug: string };

  beforeAll(async () => {
    ({ app, prisma, jwt } = await bootstrapTestApp());

    owner = await createUser(prisma, jwt);
    coAdmin = await createUser(prisma, jwt);
    outsider = await createUser(prisma, jwt);
    userIds.push(owner.id, coAdmin.id, outsider.id);

    server = await createServer(prisma, owner.id);
    await prisma.serverMember.create({
      data: { serverId: server.id, userId: coAdmin.id },
    });
  });

  afterAll(async () => {
    await cleanupUsers(prisma, userIds);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('non connecté → 401', () => http().get('/api/servers').expect(401));

  it("étranger ne voit pas le serveur d'un autre → 404", () =>
    http()
      .get(`/api/servers/${server.id}`)
      .set('Cookie', outsider.cookie)
      .expect(404));

  it('co-admin voit le serveur → 200, rôle admin', async () => {
    const res = await http()
      .get(`/api/servers/${server.id}`)
      .set('Cookie', coAdmin.cookie)
      .expect(200);
    expect(res.body.role).toBe('admin');
    // la clé API reste l'affaire du propriétaire
    expect(res.body.apiKeyPrefix).toBeNull();
  });

  it('propriétaire voit le serveur → 200, rôle owner', async () => {
    const res = await http()
      .get(`/api/servers/${server.id}`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(res.body.role).toBe('owner');
  });

  it('co-admin ne peut PAS générer de clé API → 403', () =>
    http()
      .post(`/api/servers/${server.id}/api-key`)
      .set('Cookie', coAdmin.cookie)
      .expect(403));

  it('co-admin ne peut PAS supprimer le serveur → 403', () =>
    http()
      .delete(`/api/servers/${server.id}`)
      .set('Cookie', coAdmin.cookie)
      .expect(403));

  it('co-admin ne peut PAS gérer les invitations → 403', () =>
    http()
      .post(`/api/servers/${server.id}/invite`)
      .set('Cookie', coAdmin.cookie)
      .expect(403));

  it('co-admin peut modifier la description → 200', () =>
    http()
      .patch(`/api/servers/${server.id}`)
      .set('Cookie', coAdmin.cookie)
      .set('Origin', TEST_WEB_ORIGIN)
      .send({ description: 'maj co-admin' })
      .expect(200));

  it('co-admin ne peut PAS changer le nom ni la visibilité → 403', async () => {
    await http()
      .patch(`/api/servers/${server.id}`)
      .set('Cookie', coAdmin.cookie)
      .set('Origin', TEST_WEB_ORIGIN)
      .send({ name: 'Renommé' })
      .expect(403);
    await http()
      .patch(`/api/servers/${server.id}`)
      .set('Cookie', coAdmin.cookie)
      .set('Origin', TEST_WEB_ORIGIN)
      .send({ visibility: 'public' })
      .expect(403);
  });

  it('propriétaire peut générer une clé → 201 et clé renvoyée une fois', async () => {
    const res = await http()
      .post(`/api/servers/${server.id}/api-key`)
      .set('Cookie', owner.cookie)
      .expect(201);
    expect(res.body.apiKey).toMatch(/^pal_[0-9a-f]{8}_[0-9a-f]{32}$/);
  });

  it('co-admin peut se retirer lui-même → 204', async () => {
    const tmp = await createUser(prisma, jwt);
    userIds.push(tmp.id);
    await prisma.serverMember.create({
      data: { serverId: server.id, userId: tmp.id },
    });
    await http()
      .delete(`/api/servers/${server.id}/members/${tmp.id}`)
      .set('Cookie', tmp.cookie)
      .expect(204);
  });

  it('co-admin ne peut PAS retirer un autre membre → 403', () =>
    http()
      .delete(`/api/servers/${server.id}/members/${owner.id}`)
      .set('Cookie', coAdmin.cookie)
      .expect(403));
});
