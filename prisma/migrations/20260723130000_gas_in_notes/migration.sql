-- Gás dentro de Notas Recebidas: fornecedor de gás + vencimento do boleto no recebimento
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "isGas" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gas_receipts" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
-- Acompanhamento de vencimentos: marca do alerta disparado (nota e gás)
ALTER TABLE "gas_receipts" ADD COLUMN IF NOT EXISTS "dueAlertedAt" TIMESTAMP(3);
ALTER TABLE "received_notes" ADD COLUMN IF NOT EXISTS "dueAlertedAt" TIMESTAMP(3);
