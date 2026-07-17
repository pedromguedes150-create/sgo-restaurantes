-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('COUNT', 'REFILL', 'OFFICE_SWAP', 'WITHDRAWAL', 'ADJUST');

-- CreateTable
CREATE TABLE "cash_vaults" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "balances" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cash_vaults_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cash_vaults_unitId_key" ON "cash_vaults"("unitId");

-- CreateTable
CREATE TABLE "cash_buckets" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetValue" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_buckets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cash_buckets_unitId_active_idx" ON "cash_buckets"("unitId", "active");

-- CreateTable
CREATE TABLE "cash_vault_movements" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "bucketId" TEXT,
    "bucketName" TEXT,
    "deltas" JSONB NOT NULL,
    "totalIn" DECIMAL(12,2) NOT NULL,
    "totalOut" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_vault_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cash_vault_movements_unitId_createdAt_idx" ON "cash_vault_movements"("unitId", "createdAt");
CREATE INDEX "cash_vault_movements_unitId_type_idx" ON "cash_vault_movements"("unitId", "type");
