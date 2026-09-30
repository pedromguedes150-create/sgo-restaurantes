-- Despesas — retiradas do COFRE da unidade (v1.136.0).
-- `source` é sempre SAFE: existe para rastreabilidade, não para escolha.
CREATE TYPE "ExpenseSource" AS ENUM ('SAFE');
CREATE TYPE "ExpenseCategory" AS ENUM ('MAINTENANCE', 'EMERGENCY_PURCHASE', 'FOOD', 'TRANSPORT', 'MATERIAL', 'OTHER');
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING_REFUND', 'REFUNDED', 'CANCELED');

CREATE TABLE "cash_expenses" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "source" "ExpenseSource" NOT NULL DEFAULT 'SAFE',
    "expenseDate" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "receiptPath" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING_REFUND',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),
    "refundedById" TEXT,
    "refundedByName" TEXT,
    "refundedAmount" DECIMAL(10,2),
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "cash_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_expenses_unitId_expenseDate_idx" ON "cash_expenses"("unitId", "expenseDate");
CREATE INDEX "cash_expenses_status_idx" ON "cash_expenses"("status");

ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
