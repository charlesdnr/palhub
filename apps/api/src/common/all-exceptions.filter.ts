import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Filtre global : formate les erreurs et journalise les 5xx avec la stack.
 *  Point d'accroche naturel pour brancher Sentry plus tard (voir README). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Erreur interne' };

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.log.error(`${req.method} ${req.originalUrl} -> ${status}`, stack);
    }

    res
      .status(status)
      .json(typeof body === 'string' ? { message: body } : body);
  }
}
