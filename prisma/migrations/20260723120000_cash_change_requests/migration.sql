-- Troco: troca direta no caixa (unidade sem baldes) + solicitação de troco à supervisão
ALTER TYPE "CashMovementType" ADD VALUE IF NOT EXISTS 'REGISTER_CHANGE';

DO $$ BEGIN
  CREATE TYPE "ChangeRequestStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "cash_change_requests" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "note" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_change_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cash_change_requests_unitId_status_idx" ON "cash_change_requests"("unitId", "status");
CREATE INDEX IF NOT EXISTS "cash_change_requests_status_createdAt_idx" ON "cash_change_requests"("status", "createdAt");
