-- CreateTable
CREATE TABLE "sync_configs" (
    "server_id" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "remote_path" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ,
    "last_status" TEXT,
    "last_error" TEXT,
    "last_stat_size" INTEGER,
    "last_stat_mtime" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_configs_pkey" PRIMARY KEY ("server_id")
);

-- AddForeignKey
ALTER TABLE "sync_configs" ADD CONSTRAINT "sync_configs_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
