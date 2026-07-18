import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser désactivé pour poser notre propre limite (payload palbox ~425 Ko,
  // reçu gzippé de l'agent — body-parser le décompresse automatiquement).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(compression());
  app.use(json({ limit: '8mb' }));

  if (process.env.NODE_ENV !== 'production') {
    // En dev le front (localhost:4200) passe par le proxy Angular, mais on
    // autorise aussi l'accès direct avec cookies.
    app.enableCors({
      origin: process.env.WEB_ORIGIN ?? 'http://localhost:4200',
      credentials: true,
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
