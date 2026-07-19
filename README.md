# PalHub

Plateforme multi-serveurs Palworld : chaque admin enregistre son serveur et
obtient une page publique avec la **carte interactive** (marqueurs du jeu +
bases/joueurs du serveur) et le **palbox explorer** (tous les pals des joueurs,
filtres et tris). Les données sont poussées par un petit **agent Python** qui
décode le `Level.sav` du serveur de jeu.

## Architecture

```
apps/api        API NestJS + Prisma (PostgreSQL) — auth Discord, CRUD serveurs,
                ingestion (clé API par serveur), lecture publique
apps/web        Front Angular 22 (standalone, signals, zoneless) + Leaflet
                └─ public/game-assets  tuiles (14 Mo), icônes, données du jeu
packages/shared Schémas zod des payloads agent→API + types partagés front/back
agent/          Agent Python (palhub-agent) : Level.sav → POST /api/ingest/*
tools/          Scripts de (re)génération des données statiques du jeu
infra/          docker-compose (dev: db seule / prod: db+api+nginx)
```

## Dev local (Windows)

Prérequis : Node ≥ 24.15 (installé en portable dans `~\.local\node`),
PostgreSQL 17 (service local, base `palhub`/`palhub`/`palhub`), Python 3.13 pour l'agent.

```powershell
npm install
npm run build:shared
cd apps/api ; copy .env.example .env    # remplir DISCORD_* pour le login
npx prisma migrate dev                   # applique les migrations
npm run dev:api                          # API sur :3000
npm run dev:web                          # front sur :4200 (proxy /api -> :3000)
```

Auth Discord : créer une app sur https://discord.com/developers/applications,
ajouter le redirect `http://localhost:3000/api/auth/discord/callback`, reporter
client id/secret dans `apps/api/.env`.

Agent (voir `agent/README.md`) : `palhub-agent --once --source <dossier du save>`
avec `PALHUB_API_URL=http://localhost:3000` et la clé générée dans « Mes serveurs ».

## Prod (VPS)

```bash
cp infra/.env.example infra/.env   # secrets : POSTGRES_PASSWORD, JWT_SECRET, DISCORD_*, PUBLIC_ORIGIN
docker compose -f infra/docker-compose.prod.yml up -d --build
```

Pour activer la **synchro hébergée**, renseigner en plus `WORKER_SECRET` (≥ 32
caractères, partagé avec le runner GitHub Actions) et `SYNC_ENC_KEY` (64 hex,
chiffrement des identifiants SFTP). Sans eux, la configuration SFTP côté site
est refusée.

TLS : mettre un Caddy/Traefik devant, ou certbot + un `server 443` dans
`infra/nginx/nginx.conf`.

## Données statiques du jeu

`apps/web/public/game-assets/` contient les tuiles, icônes et JSON générés
depuis les sources documentées dans `tools/provenance/PROVENANCE.md`. À la
prochaine MAJ du jeu : régénérer avec `tools/build_map_tiles.py`,
`build_map_data.py`, `build_pal_spawns.py`, puis `tools/convert_static_data.py`.

## Historique

Ce projet est la refonte propre de `../palworld_site` (site statique v1, gardé
intact et toujours en prod). Les contrats de payloads (`palbox`, `live`) et le
pipeline de décodage du save en sont directement repris.
