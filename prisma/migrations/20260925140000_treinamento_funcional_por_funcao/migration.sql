-- Treinamento funcional: público por FUNÇÃO + colaboradores adicionais + origem da atribuição.
-- Migração ADITIVA: nada é apagado ou renomeado; POPs, setores e registros existentes seguem valendo.

-- CreateEnum
CREATE TYPE "TrainingOrigin" AS ENUM ('GENERAL', 'JOB_TITLE', 'SECTOR', 'INDIVIDUAL');

-- AlterTable: origem do registro (o que existe hoje é geral ou setorial)
ALTER TABLE "training_records" ADD COLUMN "origin" "TrainingOrigin" NOT NULL DEFAULT 'GENERAL';
UPDATE "training_records" SET "origin" = 'SECTOR' WHERE "sectorName" IS NOT NULL;

-- CreateTable
CREATE TABLE "pop_job_titles" (
    "id" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,

    CONSTRAINT "pop_job_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pop_collaborators" (
    "id" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,

    CONSTRAINT "pop_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pop_job_titles_popId_jobTitle_key" ON "pop_job_titles"("popId", "jobTitle");

-- CreateIndex
CREATE UNIQUE INDEX "pop_collaborators_popId_collaboratorId_key" ON "pop_collaborators"("popId", "collaboratorId");

-- AddForeignKey
ALTER TABLE "pop_job_titles" ADD CONSTRAINT "pop_job_titles_popId_fkey" FOREIGN KEY ("popId") REFERENCES "pops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pop_collaborators" ADD CONSTRAINT "pop_collaborators_popId_fkey" FOREIGN KEY ("popId") REFERENCES "pops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pop_collaborators" ADD CONSTRAINT "pop_collaborators_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
