import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** Log une ligne par requête HTTP (méthode, route, statut, durée). */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly log = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    // le health check est appelé en boucle par la plateforme : on l'ignore
    if (req.path === '/api/health') {
      return next.handle();
    }
    const start = Date.now();
    const { method, originalUrl } = req;
    return next.handle().pipe(
      tap({
        next: () => this.write(context, method, originalUrl, start),
        error: () => this.write(context, method, originalUrl, start),
      }),
    );
  }

  private write(
    context: ExecutionContext,
    method: string,
    url: string,
    start: number,
  ): void {
    const res = context.switchToHttp().getResponse<Response>();
    const ms = Date.now() - start;
    this.log.log(`${method} ${url} ${res.statusCode} ${ms}ms`);
  }
}
