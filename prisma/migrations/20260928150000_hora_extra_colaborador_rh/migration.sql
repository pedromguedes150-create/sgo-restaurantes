-- Hora Extra vinculada ao colaborador do RH (v1.126.0). ADITIVA: coluna nula,
-- lançamentos antigos seguem só com o nome congelado em "collaboratorName".
-- AlterTable
ALTER TABLE "payment_requests" ADD COLUMN     "collaboratorId" TEXT;

-- CreateIndex
CREATE INDEX "payment_requests_collaboratorId_idx" ON "payment_requests"("collaboratorId");

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
