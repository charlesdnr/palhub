import { z } from 'zod';

export const reportSchema = z.object({
  status: z.enum(['ok', 'unchanged', 'error']),
  error: z.string().max(2000).nullish(),
  statSize: z.number().int().nullish(),
  statMtime: z.number().int().nullish(),
  // Empreinte SHA256 de la clé d'hôte SSH observée par le runner (TOFU) :
  // mémorisée à la 1re connexion, jamais réécrite ensuite côté API.
  hostKeyFp: z
    .string()
    .regex(/^[A-Za-z0-9+/=:]{16,120}$/)
    .nullish(),
});

export type ReportInput = z.infer<typeof reportSchema>;

/** Job renvoyé au runner de sync hébergée (secret déchiffré). */
export interface SyncJob {
  serverId: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  secret: string;
  remotePath: string;
  lastStatSize: number | null;
  lastStatMtime: number | null;
  /** Empreinte attendue de la clé d'hôte (null tant qu'aucune connexion). */
  hostKeyFp: string | null;
}
