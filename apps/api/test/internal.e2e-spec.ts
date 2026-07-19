import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from './../src/prisma/prisma.service';
import { encryptSecret } from './../src/common/crypto';
import {
  SeededUser,
  TEST_WORKER_SECRET,
  bootstrapTestApp,
  cleanupUsers,
  createServer,
  createUser,
} from './helpers';

describe('Sync interne : claim + report (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const userIds: string[] = [];
  let owner: SeededUser;
  let serverId: string;

  beforeAll(async () => {
    ({ app, prisma, jwt } = await bootstrapTestApp());
    owner = await createUser(prisma, jwt);
    userIds.push(owner.id);
    const s = await createServer(prisma, owner.id);
    serverId = s.id;
    await prisma.syncConfig.create({
      data: {
        serverId,
        host: 'game.example',
        port: 22,
        username: 'u',
        authType: 'password',
        secretEnc: encryptSecret('motdepasse'),
        remotePath: '/Pal/Saved/SaveGames/0/W',
        enabled: true,
      },
    });
  });

  afterAll(async () => {
    await cleanupUsers(prisma, userIds);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${TEST_WORKER_SECRET}` });

  it('sans secret runner → 401', () =>
    http().post('/api/internal/sync-jobs/claim').expect(401));

  it('report sur une config supprimée → ok:false, pas de 500', () =>
    http()
      // UUID valide mais sans config : updateMany renvoie 0 ligne, pas de 500
      .post(
        '/api/internal/sync-jobs/00000000-0000-0000-0000-000000000000/report',
      )
      .set(auth())
      .send({ status: 'ok' })
      .expect(201)
      .expect((r) => {
        if (r.body.ok !== false) throw new Error('attendu ok:false');
      }));

  it('report mémorise l’empreinte d’hôte (TOFU, 1re fois seulement)', async () => {
    await http()
      .post(`/api/internal/sync-jobs/${serverId}/report`)
      .set(auth())
      .send({ status: 'ok', hostKeyFp: 'SHA256:abcDEF123+/xyz' })
      .expect(201);
    let cfg = await prisma.syncConfig.findUnique({ where: { serverId } });
    expect(cfg?.hostKeyFp).toBe('SHA256:abcDEF123+/xyz');

    // une seconde empreinte différente ne doit pas écraser la première
    await http()
      .post(`/api/internal/sync-jobs/${serverId}/report`)
      .set(auth())
      .send({ status: 'ok', hostKeyFp: 'SHA256:autreEmpreinte99' })
      .expect(201);
    cfg = await prisma.syncConfig.findUnique({ where: { serverId } });
    expect(cfg?.hostKeyFp).toBe('SHA256:abcDEF123+/xyz');
  });

  it('claim pose un verrou : un 2e claim immédiat ne rend rien', async () => {
    // Déterminisme : verrouille toute autre config existante (base de dev) pour
    // que la config du test soit la seule réclamable, puis libère la sienne.
    await prisma.syncConfig.updateMany({
      where: { NOT: { serverId } },
      data: { claimedAt: new Date() },
    });
    await prisma.syncConfig.update({
      where: { serverId },
      data: { claimedAt: null, lastRunAt: null },
    });
    const first = await http()
      .post('/api/internal/sync-jobs/claim')
      .set(auth())
      .expect(201);
    expect(first.body.serverId).toBe(serverId);

    const second = await http()
      .post('/api/internal/sync-jobs/claim')
      .set(auth())
      .expect(201);
    // plus aucun job réclamable (le seul est verrouillé) → corps vide
    expect(second.body).toEqual({});
  });
});
