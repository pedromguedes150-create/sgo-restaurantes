-- Desperdicio em DUAS FRENTES (pedido do Pedro, 24/09/2026):
--   Restaurante = kg (o que ja existia, lista fechada da v1.79.0)
--   Salgados    = UNIDADES (novo, tabela propria)
-- Migracao ADITIVA: so acrescenta tabelas e ajusta rotulos/ativo de categorias
-- ja existentes. Nada e apagado nem renomeado no que ja esta gravado.

-- CreateEnum
CREATE TYPE "WasteSnackOptionKind" AS ENUM ('TIPO', 'MOTIVO');

-- CreateTable
CREATE TABLE "waste_snack_options" (
    "id" TEXT NOT NULL,
    "kind" "WasteSnackOptionKind" NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_snack_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_snack_discards" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "reasonId" TEXT NOT NULL,
    "reasonName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_snack_discards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waste_snack_options_kind_name_key" ON "waste_snack_options"("kind", "name");

-- CreateIndex
CREATE INDEX "waste_snack_discards_unitId_operationalDate_idx" ON "waste_snack_discards"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "waste_snack_discards_typeId_idx" ON "waste_snack_discards"("typeId");

-- AddForeignKey
ALTER TABLE "waste_snack_discards" ADD CONSTRAINT "waste_snack_discards_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_snack_discards" ADD CONSTRAINT "waste_snack_discards_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "waste_snack_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_snack_discards" ADD CONSTRAINT "waste_snack_discards_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "waste_snack_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_snack_discards" ADD CONSTRAINT "waste_snack_discards_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Frente RESTAURANTE: a folha passa a ter so 4 campos, com os rotulos que o
-- Pedro pediu. "Refeitorio" sai da FOLHA (inativado, nao apagado): os
-- lancamentos antigos continuam contando nos totais e no consolidado dos
-- meses passados — apagar do calculo mudaria numeros ja vistos.
-- Reversivel: basta reativar / renomear de volta.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE "waste_categories" SET "name" = 'Sobra Limpa (Self-Service) — Almoço' WHERE "code" = 'SS_ALMOCO';
UPDATE "waste_categories" SET "name" = 'Sobra Limpa (Self-Service) — Jantar' WHERE "code" = 'SS_JANTAR';
UPDATE "waste_categories" SET "name" = 'Sobra de Produção — Almoço'          WHERE "code" = 'PROD_ALMOCO';
UPDATE "waste_categories" SET "name" = 'Sobra de Produção — Jantar'          WHERE "code" = 'PROD_JANTAR';
UPDATE "waste_categories" SET "active" = false WHERE "code" IN ('REF_ALMOCO', 'REF_JANTAR');
