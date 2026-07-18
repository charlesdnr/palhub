import { z } from 'zod';

/**
 * Contrat du payload « live » produit par l'agent (état instantané du serveur).
 * Référence : palworld_site/data/server-live.json.
 * Coordonnées en unités monde Unreal (cm).
 */
export const liveGuildSchema = z.looseObject({
  name: z.string(),
  level: z.number().int(),
  members: z.array(z.string()),
});

export const liveBaseSchema = z.looseObject({
  x: z.number(),
  y: z.number(),
  guild: z.string().nullable(),
});

export const livePlayerSchema = z.looseObject({
  uid: z.string(),
  name: z.string(),
  level: z.number().int(),
  // null quand le save n'a pas encore de LastJumpedLocation pour ce joueur
  x: z.number().nullable(),
  y: z.number().nullable(),
  offline_s: z.number().nullable(),
  online: z.boolean(),
});

export const liveSnapshotSchema = z.looseObject({
  generated_at: z.iso.datetime(),
  world_id: z.string().min(1),
  // Absent des anciens payloads : l'API calcule alors un hash du corps reçu.
  source_hash: z.string().optional(),
  guilds: z.array(liveGuildSchema),
  bases: z.array(liveBaseSchema),
  players: z.array(livePlayerSchema),
});

export type LiveGuild = z.infer<typeof liveGuildSchema>;
export type LiveBase = z.infer<typeof liveBaseSchema>;
export type LivePlayer = z.infer<typeof livePlayerSchema>;
export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;
