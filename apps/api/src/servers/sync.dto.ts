import { z } from 'zod';

export const putSyncConfigSchema = z.object({
  host: z.string().trim().min(3).max(255),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().trim().min(1).max(255),
  authType: z.enum(['password', 'key']),
  /** mot de passe ou clé privée PEM/OpenSSH ; optionnel en modification (garde l'existant) */
  secret: z.string().min(1).max(20000).optional(),
  remotePath: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((p) => p.startsWith('/'), 'Le chemin doit commencer par /'),
  enabled: z.boolean().default(true),
});

export type PutSyncConfigInput = z.infer<typeof putSyncConfigSchema>;
