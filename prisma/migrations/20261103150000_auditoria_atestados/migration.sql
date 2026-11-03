-- v1.181.0 — Auditoria de Atestados: o atestado ESPERADO (informado pelo RH/supervisão),
-- cruzado com o lançamento do SGO. ADITIVA: nada dos atestados existentes é tocado.

-- CreateEnum
CREATE TYPE "CertificateExpectationSource" AS ENUM ('MANUAL', 'RH');

-- CreateEnum
CREATE TYPE "CertificateReviewStatus" AS ENUM ('AGUARDANDO', 'FALHA_CONFIRMADA', 'JUSTIFICADO', 'INVALIDO');

-- CreateTable
CREATE TABLE "certificate_expectations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "noticeAt" TIMESTAMP(3) NOT NULL,
    "receivedByName" TEXT,
    "source" "CertificateExpectationSource" NOT NULL DEFAULT 'MANUAL',
    "informedById" TEXT,
    "informedByName" TEXT NOT NULL,
    "note" TEXT,
    "certificateId" TEXT,
    "linkedAt" TIMESTAMP(3),
    "justification" TEXT,
    "justifiedById" TEXT,
    "justifiedByName" TEXT,
    "justifiedAt" TIMESTAMP(3),
    "reviewStatus" "CertificateReviewStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "responsibleUserId" TEXT,
    "responsibleName" TEXT,
    "responsibilityValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_expectations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_expectations_certificateId_key" ON "certificate_expectations"("certificateId");

-- CreateIndex
CREATE INDEX "certificate_expectations_unitId_startDate_idx" ON "certificate_expectations"("unitId", "startDate");

-- CreateIndex
CREATE INDEX "certificate_expectations_collaboratorId_startDate_idx" ON "certificate_expectations"("collaboratorId", "startDate");

-- AddForeignKey
ALTER TABLE "certificate_expectations" ADD CONSTRAINT "certificate_expectations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_expectations" ADD CONSTRAINT "certificate_expectations_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_expectations" ADD CONSTRAINT "certificate_expectations_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "medical_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Linha-base do STATUS do componente "Atestados" na meta: nasce em MONITORAMENTO
-- (medido e mostrado, fora da bonificação) — ligar o peso não o ativa sozinho.
INSERT INTO "meta_config_changes" ("id", "key", "value", "validFrom", "previousValue", "reason", "userId", "userName", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || 'CERTIFICATES'), 'CERTIFICATES_META_STATUS', 'MONITORAMENTO', '0000-01', NULL,
       'Linha-base da v1.181.0: o componente Atestados nasce em Monitoramento (fora da bonificação até o Admin ativar).', NULL, 'Sistema', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "meta_config_changes" WHERE "key" = 'CERTIFICATES_META_STATUS');
