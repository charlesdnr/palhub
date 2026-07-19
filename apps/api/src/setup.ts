import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { LoggingInterceptor } from './common/logging.interceptor';

/** Configuration commune de l'app (partagée entre main.ts et les tests e2e). */
export function configureApp(app: NestExpressApplication): void {
  // Derrière nginx / Render : faire confiance au premier proxy pour que req.ip
  // soit l'IP réelle du client (rate limiting par IP, sinon tout le monde partage
  // le compteur de l'IP du proxy).
  app.set('trust proxy', 1);

  // En-têtes de sécurité. La CSP s'applique surtout quand l'API sert aussi le
  // front (SERVE_STATIC=1, Render) ; en mode nginx, nginx pose la même CSP.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            'data:',
            'https://cdn.paldb.cc',
            'https://cdn.discordapp.com',
          ],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      // Le CDN d'images est chargé cross-origin : ne pas forcer COEP.
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(compression());
  // bodyParser désactivé au démarrage pour poser notre propre limite (payload
  // palbox ~425 Ko, reçu gzippé de l'agent — décompressé par body-parser).
  app.use(json({ limit: '8mb' }));

  // CSRF (défense en profondeur, en plus de SameSite=Lax) : sur les mutations
  // authentifiées par cookie, si un en-tête Origin est présent il doit
  // correspondre à l'origine du site. Les routes d'agent (Bearer, non-navigateur)
  // sont exemptées.
  const webOrigin = process.env.WEB_ORIGIN;
  app.use((req: Request, res: Response, next: NextFunction) => {
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const bearerRoute =
      req.path.startsWith('/api/ingest') ||
      req.path.startsWith('/api/internal');
    const origin = req.headers.origin;
    if (
      mutating &&
      !bearerRoute &&
      origin &&
      webOrigin &&
      origin !== webOrigin
    ) {
      res.status(403).json({ message: 'Origine non autorisée' });
      return;
    }
    next();
  });

  // Observabilité : log d'accès HTTP + capture/log des 5xx.
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
}
