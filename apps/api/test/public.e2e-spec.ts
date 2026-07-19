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
} from './helpers';

describe('Visibilité publique (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const userIds: string[] = [];
  let owner: SeededUser;

  beforeAll(async () => {
    ({ app, prisma, jwt } = await bootstrapTestApp());
    owner = await createUser(prisma, jwt);
    userIds.push(owner.id);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, userIds);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function serverWith(visibility: string) {
    const s = await createServer(prisma, owner.id);
    await prisma.server.update({ where: { id: s.id }, data: { visibility } });
    return s;
  }

  it('public : listé dans l’annuaire', async () => {
    const s = await serverWith('public');
    const res = await http().get('/api/public/servers').expect(200);
    expect(res.body.some((x: { slug: string }) => x.slug === s.slug)).toBe(
      true,
    );
  });

  it('non listé : absent de l’annuaire mais accessible par slug', async () => {
    const s = await serverWith('unlisted');
    const list = await http().get('/api/public/servers').expect(200);
    expect(list.body.some((x: { slug: string }) => x.slug === s.slug)).toBe(
      false,
    );
    await http().get(`/api/public/s/${s.slug}`).expect(200);
  });

  it('privé : 404 sur la page et les payloads', async () => {
    const s = await serverWith('private');
    await http().get(`/api/public/s/${s.slug}`).expect(404);
    await http().get(`/api/public/s/${s.slug}/palbox`).expect(404);
    await http().get(`/api/public/s/${s.slug}/live`).expect(404);
  });
});
