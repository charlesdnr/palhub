/** Types des réponses de l'API (contrat front ↔ back). */

export interface UserDto {
  id: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
}

export interface ServerDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isListed: boolean;
  worldId: string | null;
  apiKeyPrefix: string | null;
  lastIngestAt: string | null;
  createdAt: string;
}

/** Renvoyé une seule fois, à la création/rotation de la clé. */
export interface ApiKeyDto {
  apiKey: string;
  apiKeyPrefix: string;
}

export interface PublicServerDto {
  slug: string;
  name: string;
  description: string | null;
  lastIngestAt: string | null;
}

export interface IngestResultDto {
  stored: boolean;
  kind: 'palbox' | 'live';
  sourceHash: string;
}
