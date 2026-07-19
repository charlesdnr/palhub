import type { ZodError } from 'zod';

/** Format d'erreur de validation commun (pipe + ingestion). */
export function formatZodIssues(
  error: ZodError,
  max = 20,
): { path: string; message: string }[] {
  return error.issues
    .slice(0, max)
    .map((i) => ({ path: i.path.join('.'), message: i.message }));
}
