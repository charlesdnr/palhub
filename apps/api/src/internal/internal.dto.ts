import { z } from 'zod';

export const reportSchema = z.object({
  status: z.enum(['ok', 'unchanged', 'error']),
  error: z.string().max(2000).nullish(),
  statSize: z.number().int().nullish(),
  statMtime: z.number().int().nullish(),
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
}
