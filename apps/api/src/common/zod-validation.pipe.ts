import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { formatZodIssues } from './zod-error';

/** Valide le body avec un schéma zod ; renvoie 400 avec le détail des erreurs. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Payload invalide',
        issues: formatZodIssues(result.error),
      });
    }
    return result.data;
  }
}
