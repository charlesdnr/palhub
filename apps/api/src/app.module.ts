import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { IngestModule } from './ingest/ingest.module';
import { InternalModule } from './internal/internal.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';
import { ServersModule } from './servers/servers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // SERVE_STATIC=1 : l'API sert aussi le build Angular (déploiement mono-service,
    // ex. Render). Sinon (Docker Compose), nginx s'en charge.
    ...(process.env.SERVE_STATIC === '1'
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '../../web/dist/web/browser'),
            exclude: ['/api/{*splat}'],
          }),
        ]
      : []),
    // Garde-fou global par IP ; l'ingestion a sa propre limite plus stricte.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    ServersModule,
    IngestModule,
    InternalModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
