-- AlterTable : verrou de distribution des jobs de sync (claim un à un).
ALTER TABLE "sync_configs" ADD COLUMN "claimed_at" TIMESTAMPTZ;
