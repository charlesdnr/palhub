import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from './../src/prisma/prisma.service';
import {
  SeededUser,
  TEST_WEB_ORIGIN,
  bootstrapTestApp,
  cleanupUsers,
  createUser,
} from './helpers';

describe('Auth : révocation + CSRF (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const userIds: string[] = [];
  let user: SeededUser;

  beforeAll(async () => {
    ({ app, prisma, jwt } = await bootstrapTestApp());
    user = await createUser(prisma, jwt);
    userIds.push(user.id);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, userIds);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('session valide → 200 sur une route protégée', () =>
    http().get('/api/servers').set('Cookie', user.cookie).expect(200));

  it('logout-all invalide les sessions existantes → 401 ensuite', async () => {
    await http()
      .post('/api/auth/logout-all')
      .set('Cookie', user.cookie)
      .set('Origin', TEST_WEB_ORIGIN)
      .expect(201);
    // le même cookie ne passe plus (tokenVersion incrémentée)
    await http().get('/api/servers').set('Cookie', user.cookie).expect(401);
  });

  it('CSRF : mutation avec Origin étranger → 403', () =>
    http()
      .post('/api/servers')
      .set('Cookie', user.cookie)
      .set('Origin', 'https://evil.example')
      .send({ name: 'Test', slug: 'csrf-test' })
      .expect(403));

  it('CSRF : GET avec Origin étranger reste autorisé (pas une mutation)', () =>
    http()
      .get('/api/public/servers')
      .set('Origin', 'https://evil.example')
      .expect(200));
});
