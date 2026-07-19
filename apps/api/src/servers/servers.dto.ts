import { z } from 'zod';

/** Slugs interdits : entreraient en collision avec les routes du front ou de l'API. */
export const RESERVED_SLUGS = new Set([
  'api',
  's',
  'me',
  'login',
  'logout',
  'admin',
  'assets',
  'game-assets',
  'static',
  'www',
  'about',
]);

export const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9-]{3,40}$/,
    'Le slug doit faire 3 à 40 caractères : minuscules, chiffres et tirets',
  )
  .refine((s) => !RESERVED_SLUGS.has(s), 'Ce slug est réservé');

export const createServerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema,
  description: z.string().trim().max(500).optional(),
  // RGPD : attestation obligatoire que l'admin informe ses joueurs.
  playersInformed: z.literal(true, {
    message: 'Tu dois attester informer les joueurs de ton serveur',
  }),
});

/** UID court d'un joueur (comme dans les payloads). */
export const exclusionSchema = z.object({
  uid: z.string().trim().min(1).max(64),
});
export type ExclusionInput = z.infer<typeof exclusionSchema>;

export const updateServerSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  visibility: z.enum(['public', 'unlisted', 'private']).optional(),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
