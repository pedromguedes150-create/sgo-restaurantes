-- Migração AUTO-CORRETIVA / idempotente.
-- Roda do zero (CI/dev) OU re-roda em produção após `prisma migrate resolve --rolled-back`
-- (a 1ª tentativa falhou ao criar o unique index porque a prod já tinha recebimentos
-- de gás duplicados no trio unidade+fornecedor+número). Aqui removemos os duplicados
-- antes de criar o índice e usamos IF NOT EXISTS para não quebrar num re-run.

-- AlterTable
ALTER TABLE "gas_receipts" ADD COLUMN IF NOT EXISTS "importBatchId" TEXT;

-- Remove duplicados pré-existentes: mantém 1 por grupo (o mais antigo), apaga os demais,
-- para o unique index de idempotência poder ser criado.
DELETE FROM "gas_receipts" a
USING (
  SELECT "id",
         row_number() OVER (PARTITION BY "unitId", "supplierId", "noteNumber" ORDER BY "createdAt", "id") AS rn
  FROM "gas_receipts"
  WHERE "noteNumber" IS NOT NULL AND "supplierId" IS NOT NULL
) b
WHERE a."id" = b."id" AND b.rn > 1;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "gas_receipts_importBatchId_idx" ON "gas_receipts"("importBatchId");

-- CreateIndex
-- Idempotência do import: um recebimento por (unidade + fornecedor + nº da nota).
-- NULLs são distintos no Postgres → lançamentos manuais sem nº/fornecedor não conflitam.
CREATE UNIQUE INDEX IF NOT EXISTS "gas_receipts_unitId_supplierId_noteNumber_key" ON "gas_receipts"("unitId", "supplierId", "noteNumber");
