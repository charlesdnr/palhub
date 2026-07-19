# API PalHub

Toutes les routes sont préfixées par `/api`. Trois familles :

- **auth / servers** : espace admin, authentifié par cookie de session (`ph_token`,
  httpOnly). Mutations protégées par vérification d'`Origin` (CSRF).
- **ingest** : poussée de données par l'agent d'un serveur, authentifiée par clé
  API (`Authorization: Bearer pal_<prefix>_<secret>`).
- **public** : lecture publique par slug (pas d'auth).
- **internal** : réservé au runner de sync hébergée (`Authorization: Bearer <WORKER_SECRET>`).

## Ingestion (agent → API)

Clé API générée dans « Mes serveurs ». Corps JSON, `Content-Encoding: gzip` accepté.
Limite de débit : 12 requêtes/min par serveur.

| Méthode | Route | Corps | Réponses |
|---|---|---|---|
| POST | `/api/ingest/palbox` | `PalboxSnapshot` | 201 `{stored,kind,sourceHash}` · 400 payload · 401 clé · 409 doublon (`source_hash`) · 422 `world_id` verrouillé |
| POST | `/api/ingest/live` | `LiveSnapshot` | idem |

Contrats des payloads : `packages/shared/src/schemas/{palbox,live}.schema.ts`
(schémas zod faisant foi). Champs clés :

- `generated_at` (ISO), `world_id`, `source_hash` (idempotence), `schema_version` (optionnel).
- palbox : `players[]`, `pals[]`, `passive_ranks`.
- live : `guilds[]`, `bases[]`, `players[]`.

Le premier ingest verrouille le `world_id` du serveur ; les suivants doivent
correspondre (sinon 422). Un même `source_hash` renvoie 409 (déjà connu).

## Lecture publique

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/api/public/servers` | annuaire des serveurs `public` (max 100) |
| GET | `/api/public/s/:slug` | fiche serveur (404 si `private`) |
| GET | `/api/public/s/:slug/palbox` | dernier snapshot palbox — `ETag`, 304 sur `If-None-Match` |
| GET | `/api/public/s/:slug/live` | dernier état live — `ETag`, 304 |

Visibilité : `public` (annuaire + accès), `unlisted` (accès par lien seul),
`private` (404 sur fiche et payloads).

## Espace admin (cookie de session)

Auth Discord : `GET /api/auth/discord` → callback → cookie. `GET /api/auth/me`,
`POST /api/auth/logout`, `POST /api/auth/logout-all` (révoque toutes les sessions),
`DELETE /api/auth/me` (RGPD : supprime compte + données).

Serveurs (`/api/servers`) : CRUD, `POST :id/api-key` (rotation, propriétaire),
invitations (`:id/invite`, `:id/members`), sync hébergée (`:id/sync`,
`DELETE :id/sync/host-key`), RGPD (`:id/exclusions`, `POST :id/purge-snapshots`).

Droits : le propriétaire gère tout ; un co-admin gère description, synchro et
exclusions, mais pas le nom, la visibilité, la clé API, ni la suppression.

## Interne (runner de sync hébergée)

`Authorization: Bearer <WORKER_SECRET>` (≥ 32 caractères).

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/internal/sync-jobs/claim` | réclame UN job (verrou 10 min), `null` si vide |
| POST | `/api/internal/sync-jobs/:serverId/report` | statut + `hostKeyFp` (TOFU) |
| POST | `/api/internal/ingest/:serverId/:kind` | ingestion pour un serveur donné |
