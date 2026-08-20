-- AlterTable
ALTER TABLE "command_counts" ADD COLUMN     "scopeNumbers" JSONB;

-- AlterTable
ALTER TABLE "command_sequences" ADD COLUMN     "nightly" BOOLEAN NOT NULL DEFAULT false;

