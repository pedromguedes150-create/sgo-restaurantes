-- CreateEnum
CREATE TYPE "PayoutType" AS ENUM ('COMMISSION', 'MOBILITY');

-- CreateTable
CREATE TABLE "collaborator_payouts" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "PayoutType" NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaborator_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collaborator_payouts_unitId_yearMonth_idx" ON "collaborator_payouts"("unitId", "yearMonth");

-- CreateIndex
CREATE INDEX "collaborator_payouts_collaboratorId_idx" ON "collaborator_payouts"("collaboratorId");
