import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureApp(app);

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
