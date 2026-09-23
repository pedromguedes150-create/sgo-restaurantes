-- CreateTable
CREATE TABLE "gas_contract_documents" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,

    CONSTRAINT "gas_contract_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gas_contract_documents_contractId_idx" ON "gas_contract_documents"("contractId");

-- AddForeignKey
ALTER TABLE "gas_contract_documents" ADD CONSTRAINT "gas_contract_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "gas_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_contract_documents" ADD CONSTRAINT "gas_contract_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
