/** Types des réponses de l'API (contrat front ↔ back). */

export interface UserDto {
  id: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
}

export type ServerVisibility = 'public' | 'unlisted' | 'private';

export interface ServerDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: ServerVisibility;
  worldId: string | null;
  apiKeyPrefix: string | null;
  lastIngestAt: string | null;
  createdAt: string;
  /** 'owner' = propriétaire, 'admin' = co-admin invité */
  role: 'owner' | 'admin';
}

export interface InviteDto {
  token: string;
  expiresAt: string;
}

export interface InviteInfoDto {
  serverName: string;
  slug: string;
  expired: boolean;
}

export interface MemberDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin';
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

/** Config de synchro hébergée d'un serveur (le secret n'est jamais renvoyé). */
export interface SyncConfigDto {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  remotePath: string;
  enabled: boolean;
  hasSecret: boolean;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'unchanged' | 'error' | null;
  lastError: string | null;
}
