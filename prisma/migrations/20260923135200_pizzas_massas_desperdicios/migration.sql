-- CreateEnum
CREATE TYPE "PizzaDoughWasteReason" AS ENUM ('EXPIRED', 'BURNED', 'WRONG_INGREDIENT', 'DAMAGED', 'PRODUCTION_ERROR', 'OTHER');

-- CreateTable
CREATE TABLE "pizza_dough_batches" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "lotCode" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pizza_dough_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pizza_dough_wastes" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "PizzaDoughWasteReason" NOT NULL,
    "observation" TEXT,
    "photoPath" TEXT,
    "batchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pizza_dough_wastes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pizza_dough_counts" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "physicalQty" INTEGER NOT NULL,
    "expectedAtClose" INTEGER NOT NULL,
    "justification" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pizza_dough_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pizza_dough_changes" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "changedById" TEXT,
    "changedByName" TEXT,
    "reason" TEXT,
    "retroactive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pizza_dough_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pizza_dough_batches_unitId_operationalDate_idx" ON "pizza_dough_batches"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "pizza_dough_batches_unitId_expiresAt_idx" ON "pizza_dough_batches"("unitId", "expiresAt");

-- CreateIndex
CREATE INDEX "pizza_dough_wastes_unitId_operationalDate_idx" ON "pizza_dough_wastes"("unitId", "operationalDate");

-- CreateIndex
CREATE UNIQUE INDEX "pizza_dough_counts_unitId_operationalDate_key" ON "pizza_dough_counts"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "pizza_dough_changes_unitId_operationalDate_idx" ON "pizza_dough_changes"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "pizza_dough_changes_entityId_idx" ON "pizza_dough_changes"("entityId");

-- AddForeignKey
ALTER TABLE "pizza_dough_batches" ADD CONSTRAINT "pizza_dough_batches_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_dough_wastes" ADD CONSTRAINT "pizza_dough_wastes_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_dough_wastes" ADD CONSTRAINT "pizza_dough_wastes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "pizza_dough_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_dough_counts" ADD CONSTRAINT "pizza_dough_counts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_dough_changes" ADD CONSTRAINT "pizza_dough_changes_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_dough_changes" ADD CONSTRAINT "pizza_dough_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
