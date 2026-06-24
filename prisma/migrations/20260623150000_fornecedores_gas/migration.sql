-- AlterTable
ALTER TABLE "payment_requests" ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "received_notes" ADD COLUMN     "supplierId" TEXT;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "pixKey" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gas_receipts" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "supplierId" TEXT,
    "operationalDate" TEXT NOT NULL,
    "accessKey" TEXT,
    "noteNumber" TEXT,
    "quantityKg" DECIMAL(10,2) NOT NULL,
    "totalValue" DECIMAL(12,2) NOT NULL,
    "pricePerKg" DECIMAL(10,4) NOT NULL,
    "prevPricePerKg" DECIMAL(10,4),
    "variationPct" DOUBLE PRECISION,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "observation" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gas_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_active_idx" ON "suppliers"("active");

-- CreateIndex
CREATE INDEX "gas_receipts_unitId_operationalDate_idx" ON "gas_receipts"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "gas_receipts_supplierId_idx" ON "gas_receipts"("supplierId");

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_notes" ADD CONSTRAINT "received_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_receipts" ADD CONSTRAINT "gas_receipts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_receipts" ADD CONSTRAINT "gas_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gas_receipts" ADD CONSTRAINT "gas_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

