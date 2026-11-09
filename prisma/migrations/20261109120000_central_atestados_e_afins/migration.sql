-- v1.196.0 — Central de Atestados e Afins: classificação por nomenclatura (4 grupos),
-- situação do lançamento e o status "Licença" (LI) na Escala. ADITIVA: nenhuma coluna
-- ou linha existente é alterada além do backfill da situação.

-- Licença na Escala (derivada do documento do grupo Licenças).
ALTER TYPE "DayStatus" ADD VALUE IF NOT EXISTS 'LICENCA';

-- Grupo do documento (a classificação é pela NOMENCLATURA; o grupo agrupa).
CREATE TYPE "DocumentGroup" AS ENUM ('ATESTADO', 'AFASTAMENTO', 'COMPARECIMENTO', 'LICENCA');

-- Situação do lançamento.
CREATE TYPE "DocumentStatus" AS ENUM ('AGUARDANDO_LEITURA', 'LEITURA_CONCLUIDA', 'CLASSIFICACAO_PENDENTE', 'ENVIADO_RH', 'EM_ANALISE_RH', 'CORRECAO_SOLICITADA', 'CORRIGIDO_REENVIADO', 'VALIDADO_RH', 'NAO_ACEITO', 'CONCLUIDO');

ALTER TABLE "medical_certificates"
  ADD COLUMN "documentGroup" "DocumentGroup",
  ADD COLUMN "nomenclature" TEXT,
  ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'LEITURA_CONCLUIDA',
  ADD COLUMN "statusNote" TEXT,
  ADD COLUMN "statusAt" TIMESTAMP(3);

-- Registros anteriores ao fluxo: o RH já os tinha (rhAtestadoId) → "Enviado ao RH"; senão "Concluído".
UPDATE "medical_certificates" SET "status" = CASE WHEN "rhAtestadoId" IS NOT NULL THEN 'ENVIADO_RH'::"DocumentStatus" ELSE 'CONCLUIDO'::"DocumentStatus" END;

CREATE INDEX "medical_certificates_status_idx" ON "medical_certificates"("status");
