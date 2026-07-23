-- Gás dentro de Notas Recebidas: fornecedor de gás + vencimento do boleto no recebimento
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "isGas" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gas_receipts" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
