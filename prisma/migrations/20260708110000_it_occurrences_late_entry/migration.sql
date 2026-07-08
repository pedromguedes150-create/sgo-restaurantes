-- AlterTable (Ocorrências: segmento TI)
ALTER TABLE "occurrence_types" ADD COLUMN "isIT" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable (item 4: data efetiva do lançamento + edição penalizada)
ALTER TABLE "payment_requests" ADD COLUMN "entryDate" TIMESTAMP(3);
ALTER TABLE "payment_requests" ADD COLUMN "dateEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payment_requests" ADD COLUMN "dateEditedByName" TEXT;

ALTER TABLE "received_notes" ADD COLUMN "entryDate" TIMESTAMP(3);
ALTER TABLE "received_notes" ADD COLUMN "dateEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "received_notes" ADD COLUMN "dateEditedByName" TEXT;

ALTER TABLE "gas_receipts" ADD COLUMN "dateEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gas_receipts" ADD COLUMN "dateEditedByName" TEXT;

ALTER TABLE "oil_collections" ADD COLUMN "dateEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "oil_collections" ADD COLUMN "dateEditedByName" TEXT;

-- AlterTable (integração RH: CPF para casar eventos de desligamento)
ALTER TABLE "collaborators" ADD COLUMN "cpf" TEXT;
CREATE INDEX "collaborators_cpf_idx" ON "collaborators"("cpf");

