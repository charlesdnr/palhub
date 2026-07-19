-- AlterTable : empreinte de la clé d'hôte SSH (TOFU persistant).
ALTER TABLE "sync_configs" ADD COLUMN "host_key_fp" TEXT;
