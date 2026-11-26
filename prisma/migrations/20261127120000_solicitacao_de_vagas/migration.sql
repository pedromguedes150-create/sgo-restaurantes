-- v1.227.0 — Solicitação de Vagas (aditiva: quatro tabelas novas).
-- CreateTable
CREATE TABLE "vaga_solicitacoes" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "unitId" TEXT NOT NULL,
    "cargoResumo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "requisitos" TEXT,
    "observacao" TEXT,
    "inicioDesejado" TEXT NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDENTE_APROVACAO',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoParaAprovacaoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decididoPorId" TEXT,
    "decididoPorNome" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoDevolucao" TEXT,
    "canceladoPorNome" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "excluidaEm" TIMESTAMP(3),
    "excluidaPorNome" TEXT,
    "motivoExclusao" TEXT,
    "rhEnvioAcao" TEXT,
    "rhEnvioSituacao" TEXT,
    "rhEnvioTentativas" INTEGER NOT NULL DEFAULT 0,
    "rhEnvioHttp" INTEGER,
    "rhEnvioMotivo" TEXT,
    "rhEnvioProximaEm" TIMESTAMP(3),
    "rhEnviadoEm" TIMESTAMP(3),
    "rhChegouEm" TIMESTAMP(3),
    "rhVagaId" TEXT,
    "codigoRh" TEXT,
    "rhSituacao" TEXT,
    "rhSituacaoEm" TIMESTAMP(3),
    "rhCandidato" TEXT,
    "rhObservacao" TEXT,
    "lembreteEm" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaga_solicitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaga_posicoes" (
    "id" TEXT NOT NULL,
    "vagaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "cargo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "substituiNome" TEXT,
    "substituiColaboradorId" TEXT,
    "escala" TEXT NOT NULL,
    "horario" TEXT NOT NULL,
    "inicioDesejado" TEXT NOT NULL,
    "requisitos" TEXT,
    "observacao" TEXT,

    CONSTRAINT "vaga_posicoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaga_curriculos" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "vagaId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "indicadoPor" TEXT,
    "enviadoPorId" TEXT,
    "enviadoPorNome" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidoEm" TIMESTAMP(3),
    "removidoPorNome" TEXT,
    "fluxo" TEXT,
    "decididoPorNome" TEXT,
    "decididoPorEmail" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoRecusa" TEXT,
    "observacaoEnvio" TEXT,
    "rhEnvioSituacao" TEXT,
    "rhEnvioTentativas" INTEGER NOT NULL DEFAULT 0,
    "rhEnvioHttp" INTEGER,
    "rhEnvioMotivo" TEXT,
    "rhEnvioProximaEm" TIMESTAMP(3),
    "rhEnviadoEm" TIMESTAMP(3),
    "rhResultadoEm" TIMESTAMP(3),
    "rhObservacao" TEXT,
    "rhSituacao" TEXT,
    "rhSituacaoEm" TIMESTAMP(3),

    CONSTRAINT "vaga_curriculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaga_eventos" (
    "id" TEXT NOT NULL,
    "vagaId" TEXT NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'SGO',
    "descricao" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "rhEventoId" TEXT,
    "dados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaga_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vaga_solicitacoes_number_key" ON "vaga_solicitacoes"("number");

-- CreateIndex
CREATE INDEX "vaga_solicitacoes_unitId_status_idx" ON "vaga_solicitacoes"("unitId", "status");

-- CreateIndex
CREATE INDEX "vaga_solicitacoes_status_idx" ON "vaga_solicitacoes"("status");

-- CreateIndex
CREATE INDEX "vaga_solicitacoes_rhEnvioSituacao_idx" ON "vaga_solicitacoes"("rhEnvioSituacao");

-- CreateIndex
CREATE INDEX "vaga_posicoes_vagaId_idx" ON "vaga_posicoes"("vagaId");

-- CreateIndex
CREATE UNIQUE INDEX "vaga_curriculos_number_key" ON "vaga_curriculos"("number");

-- CreateIndex
CREATE INDEX "vaga_curriculos_vagaId_idx" ON "vaga_curriculos"("vagaId");

-- CreateIndex
CREATE INDEX "vaga_curriculos_rhEnvioSituacao_idx" ON "vaga_curriculos"("rhEnvioSituacao");

-- CreateIndex
CREATE INDEX "vaga_eventos_vagaId_createdAt_idx" ON "vaga_eventos"("vagaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vaga_eventos_vagaId_rhEventoId_key" ON "vaga_eventos"("vagaId", "rhEventoId");

-- AddForeignKey
ALTER TABLE "vaga_solicitacoes" ADD CONSTRAINT "vaga_solicitacoes_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaga_posicoes" ADD CONSTRAINT "vaga_posicoes_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "vaga_solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaga_curriculos" ADD CONSTRAINT "vaga_curriculos_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "vaga_solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaga_eventos" ADD CONSTRAINT "vaga_eventos_vagaId_fkey" FOREIGN KEY ("vagaId") REFERENCES "vaga_solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

