-- Foto do recibo da coleta de oleo.
-- Aditiva de proposito: a coluna nasce NULL para as coletas ja lancadas. Exigir
-- o comprovante ali seria reescrever historico que ninguem tem mais como
-- comprovar. A obrigatoriedade vale para lancamento NOVO, em createOilCollection.
ALTER TABLE "oil_collections" ADD COLUMN "receiptPath" TEXT;
