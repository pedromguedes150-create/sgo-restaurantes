-- Sessao de conferencia de comandas.
--
-- Ate aqui havia UMA contagem por unidade por dia (command_counts, unique
-- unidade+data): comecar outra sobrescrevia a anterior, e a tela chegava a
-- avisar "as marcas sao da contagem de 03/09, nao de hoje". Nao existia
-- historico, e a grade reabria com marcas de outro dia.
--
-- Aditivo: command_counts continua intacta, como a SITUACAO ATUAL do dia, e
-- continua sendo ela que gera divergencias. A sessao a alimenta ao finalizar.

-- CreateEnum
CREATE TYPE "CommandSessionType" AS ENUM ('FAIXA_DO_DIA', 'COMPLETA');

-- CreateEnum
CREATE TYPE "CommandSessionMethod" AS ENUM ('MANUAL', 'LEITOR', 'MISTO');

-- CreateEnum
CREATE TYPE "CommandSessionStatus" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CommandItemState" AS ENUM ('CONFERIDA', 'EM_USO');

-- CreateEnum
CREATE TYPE "CommandItemMethod" AS ENUM ('MANUAL', 'LEITOR');

-- CreateTable
CREATE TABLE "command_count_sessions" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "type" "CommandSessionType" NOT NULL,
    "method" "CommandSessionMethod" NOT NULL,
    "status" "CommandSessionStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "scopeNumbers" JSONB,
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "observation" TEXT,
    "presentCount" INTEGER NOT NULL DEFAULT 0,
    "inUseCount" INTEGER NOT NULL DEFAULT 0,
    "absentCount" INTEGER NOT NULL DEFAULT 0,
    "divergenceCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "command_count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_count_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "state" "CommandItemState" NOT NULL,
    "method" "CommandItemMethod" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "command_count_sessions_unitId_startedAt_idx" ON "command_count_sessions"("unitId", "startedAt");

-- CreateIndex
CREATE INDEX "command_count_sessions_unitId_status_idx" ON "command_count_sessions"("unitId", "status");

-- CreateIndex
CREATE INDEX "command_count_items_sessionId_idx" ON "command_count_items"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "command_count_items_sessionId_number_key" ON "command_count_items"("sessionId", "number");

-- AddForeignKey
ALTER TABLE "command_count_sessions" ADD CONSTRAINT "command_count_sessions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_count_sessions" ADD CONSTRAINT "command_count_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_count_items" ADD CONSTRAINT "command_count_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "command_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

