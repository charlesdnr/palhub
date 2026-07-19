-- RGPD : attestation d'information des joueurs + exclusions de joueurs.
ALTER TABLE "servers" ADD COLUMN "players_informed_at" TIMESTAMPTZ;

CREATE TABLE "player_exclusions" (
    "server_id" UUID NOT NULL,
    "uid" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_exclusions_pkey" PRIMARY KEY ("server_id","uid")
);

ALTER TABLE "player_exclusions" ADD CONSTRAINT "player_exclusions_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
