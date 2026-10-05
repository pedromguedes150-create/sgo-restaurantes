-- Abono pecuniário (venda de dias de férias) — v1.153.0. Migração ADITIVA: só cria a tabela.
-- CreateTable
CREATE TABLE "vacation_abonos" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "periodoInicio" TEXT NOT NULL,
    "dias" INTEGER NOT NULL,
    "observacao" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacation_abonos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacation_abonos_unitId_idx" ON "vacation_abonos"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_abonos_collaboratorId_periodoInicio_key" ON "vacation_abonos"("collaboratorId", "periodoInicio");

-- AddForeignKey
ALTER TABLE "vacation_abonos" ADD CONSTRAINT "vacation_abonos_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

