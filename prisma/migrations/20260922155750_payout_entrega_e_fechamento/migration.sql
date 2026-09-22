-- CreateTable
CREATE TABLE "payout_deliveries" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "type" "PayoutType" NOT NULL,
    "deliveredAt" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_closures" (
    "id" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "type" "PayoutType" NOT NULL,
    "closedById" TEXT,
    "closedByName" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_deliveries_yearMonth_type_idx" ON "payout_deliveries"("yearMonth", "type");

-- CreateIndex
CREATE UNIQUE INDEX "payout_deliveries_unitId_yearMonth_type_key" ON "payout_deliveries"("unitId", "yearMonth", "type");

-- CreateIndex
CREATE UNIQUE INDEX "payout_closures_yearMonth_type_key" ON "payout_closures"("yearMonth", "type");

-- AddForeignKey
ALTER TABLE "payout_deliveries" ADD CONSTRAINT "payout_deliveries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
