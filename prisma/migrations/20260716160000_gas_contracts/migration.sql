-- CreateTable (contratos de gás por unidade+fornecedor)
CREATE TABLE "gas_contracts" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "quantityKg" DECIMAL(12,2) NOT NULL,
    "pricePerKg" DECIMAL(10,4) NOT NULL,
    "initialUsedKg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gas_contracts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gas_contracts_unitId_active_idx" ON "gas_contracts"("unitId", "active");
CREATE INDEX "gas_contracts_supplierId_idx" ON "gas_contracts"("supplierId");
