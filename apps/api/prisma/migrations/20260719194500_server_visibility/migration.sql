-- AlterTable : remplace is_listed (booléen) par visibility (public/unlisted/private).
ALTER TABLE "servers" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'unlisted';
UPDATE "servers" SET "visibility" = 'public' WHERE "is_listed" = true;
ALTER TABLE "servers" DROP COLUMN "is_listed";
