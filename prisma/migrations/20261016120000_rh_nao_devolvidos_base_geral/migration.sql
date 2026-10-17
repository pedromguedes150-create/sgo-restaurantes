-- RH: conferência na base inteira para quem a unidade não devolveu (v1.171.0).
-- Migração ADITIVA: nenhuma linha é tocada.
ALTER TABLE "collaborators" ADD COLUMN "inactiveSince" TEXT;
ALTER TABLE "collaborators" ADD COLUMN "inactiveReason" TEXT;
ALTER TABLE "collaborators" ADD COLUMN "rhMissingSince" TEXT;
ALTER TABLE "collaborators" ADD COLUMN "rhMissingLastDay" TEXT;
ALTER TABLE "collaborators" ADD COLUMN "rhMissingDays" INTEGER NOT NULL DEFAULT 0;
