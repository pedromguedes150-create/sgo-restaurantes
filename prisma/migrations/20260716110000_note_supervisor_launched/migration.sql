-- AlterTable (Notas: lançamento pela supervisão desconta na meta — 16/07)
ALTER TABLE "received_notes" ADD COLUMN "supervisorLaunched" BOOLEAN NOT NULL DEFAULT false;
