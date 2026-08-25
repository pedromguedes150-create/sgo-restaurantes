-- CreateTable
CREATE TABLE "item_cancellation_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "item_cancellation_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_cancellations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3) NOT NULL,
    "tableLabel" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "waiterName" TEXT,
    "reasonId" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "photoPath" TEXT,
    "note" TEXT,
    "authorizedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_cancellations_unitId_operationalDate_idx" ON "item_cancellations"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "item_cancellations_unitId_delivered_idx" ON "item_cancellations"("unitId", "delivered");

-- AddForeignKey
ALTER TABLE "item_cancellations" ADD CONSTRAINT "item_cancellations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_cancellations" ADD CONSTRAINT "item_cancellations_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "item_cancellation_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_cancellations" ADD CONSTRAINT "item_cancellations_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

