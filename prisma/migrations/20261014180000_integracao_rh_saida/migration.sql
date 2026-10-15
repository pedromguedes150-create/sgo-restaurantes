-- Envio automático SGO → GBF-RH (v1.168.0). Migração ADITIVA:
--   * fila de saída (rh_eventos_saida) e demandas ao RH (rh_demandas);
--   * atestado guarda o id devolvido pelo RH; desligamento ganha os campos do
--     contrato do RH e o aviso legado passa a ser opcional (justa causa e término
--     de experiência não têm aviso).
-- Nada é apagado nem renomeado. As tabelas external_connections/external_request_logs
-- (v1.132.2) seguem no banco: o diff do Prisma as lista para DROP e isto foi removido à mão.

-- CreateEnum
CREATE TYPE "RhOutboundType" AS ENUM ('ATESTADO', 'DESLIGAMENTO', 'DEMANDA');

-- CreateEnum
CREATE TYPE "RhOutboundStatus" AS ENUM ('PENDENTE', 'ENVIANDO', 'ENVIADO', 'ERRO', 'ESGOTADO', 'PARADO');

-- CreateEnum
CREATE TYPE "RhDemandType" AS ENUM ('ADMISSAO', 'DESLIGAMENTO', 'ATESTADO', 'FERIAS', 'MUDANCA_HORARIO', 'MUDANCA_FUNCAO_SALARIO', 'BENEFICIO', 'DUVIDA', 'OUTRO');

-- CreateEnum
CREATE TYPE "RhDemandPriority" AS ENUM ('NORMAL', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "RhTerminationKind" AS ENUM ('DISPENSA_SEM_JUSTA_CAUSA', 'JUSTA_CAUSA', 'PEDIDO_DEMISSAO', 'ACORDO_484A', 'TERMINO_EXPERIENCIA');

-- CreateEnum
CREATE TYPE "RhNoticeMode" AS ENUM ('TRABALHADO_2H', 'TRABALHADO_7DIAS', 'INDENIZADO', 'NAO_CUMPRIDO');

-- CreateEnum
CREATE TYPE "RhTerminationReason" AS ENUM ('DESEMPENHO', 'COMPORTAMENTO', 'FALTAS_ATRASOS', 'REDUCAO_QUADRO', 'FIM_EXPERIENCIA', 'OUTRA_OPORTUNIDADE', 'MOTIVO_PESSOAL', 'SAUDE', 'OUTRO');

-- AlterTable
ALTER TABLE "medical_certificates" ADD COLUMN     "rhAtestadoId" TEXT;

-- AlterTable
ALTER TABLE "terminations" ADD COLUMN     "letterPath" TEXT,
ADD COLUMN     "noticeMode" "RhNoticeMode",
ADD COLUMN     "reasonCode" "RhTerminationReason",
ADD COLUMN     "rhPrazoLegal" TEXT,
ADD COLUMN     "rhProcesso" TEXT,
ADD COLUMN     "rhSituacao" TEXT,
ADD COLUMN     "rhSituacaoAt" TIMESTAMP(3),
ADD COLUMN     "terminationDate" TEXT,
ADD COLUMN     "terminationKind" "RhTerminationKind",
ALTER COLUMN "noticeType" DROP NOT NULL;

-- CreateTable
CREATE TABLE "rh_eventos_saida" (
    "id" TEXT NOT NULL,
    "sgoEventId" TEXT NOT NULL,
    "tipo" "RhOutboundType" NOT NULL,
    "acao" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "anexoPath" TEXT,
    "status" "RhOutboundStatus" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoErro" TEXT,
    "httpStatus" INTEGER,
    "resposta" JSONB,
    "rhId" TEXT,
    "observacao" TEXT,
    "unitId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEm" TIMESTAMP(3),

    CONSTRAINT "rh_eventos_saida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_demandas" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "collaboratorId" TEXT,
    "tipo" "RhDemandType" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataEvento" TEXT,
    "prioridade" "RhDemandPriority" NOT NULL DEFAULT 'NORMAL',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByEmail" TEXT,
    "rhNumero" TEXT,
    "rhPrazoAlvo" TEXT,
    "rhSituacao" TEXT,
    "rhSituacaoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_demandas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rh_eventos_saida_sgoEventId_key" ON "rh_eventos_saida"("sgoEventId");

-- CreateIndex
CREATE INDEX "rh_eventos_saida_status_proximaTentativaEm_idx" ON "rh_eventos_saida"("status", "proximaTentativaEm");

-- CreateIndex
CREATE INDEX "rh_eventos_saida_tipo_referenceId_idx" ON "rh_eventos_saida"("tipo", "referenceId");

-- CreateIndex
CREATE INDEX "rh_eventos_saida_createdAt_idx" ON "rh_eventos_saida"("createdAt");

-- CreateIndex
CREATE INDEX "rh_demandas_unitId_createdAt_idx" ON "rh_demandas"("unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "rh_demandas" ADD CONSTRAINT "rh_demandas_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_demandas" ADD CONSTRAINT "rh_demandas_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

