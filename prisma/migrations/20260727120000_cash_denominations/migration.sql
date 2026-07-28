-- CreateTable
CREATE TABLE "cash_denominations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(10,2),
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "label" TEXT,
    "isSmall" BOOLEAN NOT NULL DEFAULT false,
    "isBig" BOOLEAN NOT NULL DEFAULT false,
    "countsAsBigIndicator" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_denominations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_denominations_unitId_active_idx" ON "cash_denominations"("unitId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "cash_denominations_unitId_key_key" ON "cash_denominations"("unitId", "key");

-- AddForeignKey
ALTER TABLE "cash_denominations" ADD CONSTRAINT "cash_denominations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
