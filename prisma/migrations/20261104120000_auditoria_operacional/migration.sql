-- v1.184.0 — Auditoria operacional por ocorrência (Notas, Gás, Óleo, Pagamentos):
-- a ocorrência ESPERADA, informada pela supervisão, cruzada com o lançamento do
-- módulo. ADITIVA: nenhuma tabela dos módulos é tocada; o vínculo é por id, sem FK.

-- CreateEnum
CREATE TYPE "OperationalAuditModule" AS ENUM ('NOTES', 'GAS', 'OIL', 'PAYMENTS');

-- CreateEnum
CREATE TYPE "OperationalExpectationSource" AS ENUM ('SUPERVISION', 'SUPPLIER', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "OperationalReviewStatus" AS ENUM ('AGUARDANDO', 'FALHA_CONFIRMADA', 'JUSTIFICADO', 'INVALIDO');

-- CreateTable
CREATE TABLE "operational_expectations" (
    "id" TEXT NOT NULL,
    "module" "OperationalAuditModule" NOT NULL,
    "unitId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "eventDate" TEXT NOT NULL,
    "noticeAt" TIMESTAMP(3) NOT NULL,
    "source" "OperationalExpectationSource" NOT NULL DEFAULT 'SUPERVISION',
    "sourceDetail" TEXT,
    "informedById" TEXT,
    "informedByName" TEXT NOT NULL,
    "expectedUserId" TEXT,
    "expectedUserName" TEXT,
    "note" TEXT,
    "entryId" TEXT,
    "entryAt" TIMESTAMP(3),
    "entryByName" TEXT,
    "linkedAt" TIMESTAMP(3),
    "justification" TEXT,
    "justifiedById" TEXT,
    "justifiedByName" TEXT,
    "justifiedAt" TIMESTAMP(3),
    "reviewStatus" "OperationalReviewStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "responsibleUserId" TEXT,
    "responsibleName" TEXT,
    "responsibilityValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_expectations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operational_expectations_module_entryId_key" ON "operational_expectations"("module", "entryId");

-- CreateIndex
CREATE INDEX "operational_expectations_unitId_eventDate_idx" ON "operational_expectations"("unitId", "eventDate");

-- CreateIndex
CREATE INDEX "operational_expectations_module_eventDate_idx" ON "operational_expectations"("module", "eventDate");

-- AddForeignKey
ALTER TABLE "operational_expectations" ADD CONSTRAINT "operational_expectations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Linha-base do STATUS dos quatro componentes novos: nascem em MONITORAMENTO
-- (medidos e mostrados, fora da bonificação) — ligar o peso não os ativa sozinho.
INSERT INTO "meta_config_changes" ("id", "key", "value", "validFrom", "previousValue", "reason", "userId", "userName", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || k.key), k.key, 'MONITORAMENTO', '0000-01', NULL,
       'Linha-base da v1.184.0: o componente da auditoria operacional nasce em Monitoramento (fora da bonificação até o Admin ativar).', NULL, 'Sistema', CURRENT_TIMESTAMP
FROM (VALUES ('NOTES_AUDIT_META_STATUS'), ('GAS_AUDIT_META_STATUS'), ('OIL_AUDIT_META_STATUS'), ('PAYMENTS_AUDIT_META_STATUS')) AS k(key)
WHERE NOT EXISTS (SELECT 1 FROM "meta_config_changes" WHERE "key" = k.key);
