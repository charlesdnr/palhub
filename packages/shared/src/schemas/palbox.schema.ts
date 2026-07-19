import { z } from 'zod';

/**
 * Contrat du payload « palbox » produit par l'agent (tous les pals des joueurs).
 * Référence : palworld_site/data/palbox.json (~425 Ko).
 */
export const palIvsSchema = z.looseObject({
  hp: z.number().int(),
  shot: z.number().int(),
  defense: z.number().int(),
});

export const palSchema = z.looseObject({
  id: z.string(),
  owner: z.string().nullable(),
  species: z.string(),
  species_id: z.string(),
  nickname: z.string().nullable(),
  level: z.number().int(),
  rank: z.number().int(),
  // null pour certains pals (humains capturés notamment)
  gender: z.string().nullable(),
  lucky: z.boolean(),
  alpha: z.boolean(),
  ivs: palIvsSchema,
  passives: z.array(z.string()),
  // null quand le pal n'est pas rangé dans un conteneur
  container: z.string().nullable(),
  slot: z.number().int(),
});

export const palboxPlayerSchema = z.looseObject({
  uid: z.string(),
  name: z.string(),
  level: z.number().int(),
});

export const palboxSnapshotSchema = z.looseObject({
  generated_at: z.iso.datetime(),
  source_hash: z.string().min(1),
  // Version du contrat de payload (permet une future transition sans casser
  // les agents déjà déployés). Absent des anciens agents.
  schema_version: z.number().int().optional(),
  world_id: z.string().min(1),
  passive_ranks: z.record(z.string(), z.number().int()),
  players: z.array(palboxPlayerSchema),
  pals: z.array(palSchema),
});

export type PalIvs = z.infer<typeof palIvsSchema>;
export type Pal = z.infer<typeof palSchema>;
export type PalboxPlayer = z.infer<typeof palboxPlayerSchema>;
export type PalboxSnapshot = z.infer<typeof palboxSnapshotSchema>;
