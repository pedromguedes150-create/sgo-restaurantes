-- AlterTable
ALTER TABLE "gas_receipts" ADD COLUMN     "importBatchId" TEXT;

-- CreateIndex
CREATE INDEX "gas_receipts_importBatchId_idx" ON "gas_receipts"("importBatchId");

-- CreateIndex
-- Idempotência do import em lote: 1 recebimento por (unidade + fornecedor + nº da nota).
-- NULLs são distintos no Postgres, então lançamentos manuais sem nº/fornecedor não conflitam.
CREATE UNIQUE INDEX "gas_receipts_unitId_supplierId_noteNumber_key" ON "gas_receipts"("unitId", "supplierId", "noteNumber");
