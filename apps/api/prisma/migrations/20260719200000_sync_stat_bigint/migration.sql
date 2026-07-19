-- AlterTable : mtime Unix en Int déborde en 2038 ; passage en BigInt.
ALTER TABLE "sync_configs" ALTER COLUMN "last_stat_size" SET DATA TYPE BIGINT;
ALTER TABLE "sync_configs" ALTER COLUMN "last_stat_mtime" SET DATA TYPE BIGINT;
