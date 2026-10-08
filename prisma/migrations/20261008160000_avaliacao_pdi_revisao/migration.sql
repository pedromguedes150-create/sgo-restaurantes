-- Avaliação: plano de desenvolvimento individual + revisão pela Supervisão (v1.162.0).
-- Migração ADITIVA: 1 enum, 1 tabela, 5 colunas na avaliação.

-- CreateEnum
CREATE TYPE "DevelopmentPlanStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "collaborator_evaluations" ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "reviewRequestedAt" TIMESTAMP(3),
ADD COLUMN     "reviewRequestedById" TEXT,
ADD COLUMN     "reviewRequestedByName" TEXT,
ADD COLUMN     "reviewResolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "development_plans" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "criterionKey" TEXT,
    "criterionLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "responsibleId" TEXT,
    "responsibleName" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "DevelopmentPlanStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "development_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "development_plans_collaboratorId_idx" ON "development_plans"("collaboratorId");

-- CreateIndex
CREATE INDEX "development_plans_unitId_status_idx" ON "development_plans"("unitId", "status");

-- AddForeignKey
ALTER TABLE "development_plans" ADD CONSTRAINT "development_plans_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "collaborator_evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

