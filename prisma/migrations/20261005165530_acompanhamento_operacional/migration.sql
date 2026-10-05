-- Acompanhamento Operacional da Rotina do Supervisor (v1.155.0). Migração ADITIVA.
-- CreateEnum
CREATE TYPE "UnitOperationType" AS ENUM ('RESTAURANTE', 'LANCHONETE', 'CD', 'FABRICA');

-- CreateEnum
CREATE TYPE "VisitKind" AS ENUM ('SIMPLES', 'OPERACIONAL');

-- CreateEnum
CREATE TYPE "AuditItemLevel" AS ENUM ('PRIMORDIAL', 'COMPLEMENTAR');

-- CreateEnum
CREATE TYPE "AuditItemMode" AS ENUM ('SIMPLES', 'AMOSTRAGEM', 'TEMPERATURA');

-- CreateEnum
CREATE TYPE "AuditAnswer" AS ENUM ('CONFORME', 'NAO_CONFORME', 'NAO_SE_APLICA');

-- CreateEnum
CREATE TYPE "AuditGravity" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "VisitActionStatus" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_VALIDACAO', 'RESOLVIDO');

-- AlterTable
ALTER TABLE "supervisor_visits" ADD COLUMN     "kind" "VisitKind" NOT NULL DEFAULT 'SIMPLES',
ADD COLUMN     "preVisitSnapshot" JSONB,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "summary" JSONB;

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "operationType" "UnitOperationType" NOT NULL DEFAULT 'RESTAURANTE';

-- CreateTable
CREATE TABLE "visit_audit_items" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "section" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "level" "AuditItemLevel" NOT NULL DEFAULT 'COMPLEMENTAR',
    "mode" "AuditItemMode" NOT NULL DEFAULT 'SIMPLES',
    "unitTypes" "UnitOperationType"[],
    "requiresPizzeria" BOOLEAN NOT NULL DEFAULT false,
    "photoOnNc" BOOLEAN NOT NULL DEFAULT false,
    "noteOnNc" BOOLEAN NOT NULL DEFAULT false,
    "tempMin" DECIMAL(6,2),
    "tempMax" DECIMAL(6,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_audit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_audit_responses" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "itemId" TEXT,
    "section" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "mode" "AuditItemMode" NOT NULL DEFAULT 'SIMPLES',
    "tempMin" DECIMAL(6,2),
    "tempMax" DECIMAL(6,2),
    "photoOnNc" BOOLEAN NOT NULL DEFAULT false,
    "noteOnNc" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "answer" "AuditAnswer",
    "note" TEXT,
    "gravity" "AuditGravity",
    "photos" JSONB,
    "sampleChecked" INTEGER,
    "sampleOk" INTEGER,
    "temperature" DECIMAL(6,2),
    "answeredById" TEXT,
    "answeredByName" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_audit_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_actions" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "responseId" TEXT,
    "unitId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "responsibleName" TEXT,
    "dueDate" TEXT,
    "gravity" "AuditGravity" NOT NULL DEFAULT 'MEDIA',
    "photoPath" TEXT,
    "note" TEXT,
    "status" "VisitActionStatus" NOT NULL DEFAULT 'ABERTO',
    "occurrenceId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitNote" TEXT,
    "unitUpdatedBy" TEXT,
    "unitUpdatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "validatedByName" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validatedVisitId" TEXT,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "visit_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_audit_items_seedKey_key" ON "visit_audit_items"("seedKey");

-- CreateIndex
CREATE INDEX "visit_audit_responses_visitId_idx" ON "visit_audit_responses"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "visit_audit_responses_visitId_itemKey_key" ON "visit_audit_responses"("visitId", "itemKey");

-- CreateIndex
CREATE INDEX "visit_actions_unitId_status_idx" ON "visit_actions"("unitId", "status");

-- CreateIndex
CREATE INDEX "visit_actions_visitId_idx" ON "visit_actions"("visitId");

-- AddForeignKey
ALTER TABLE "visit_audit_responses" ADD CONSTRAINT "visit_audit_responses_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "supervisor_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_actions" ADD CONSTRAINT "visit_actions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "supervisor_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
