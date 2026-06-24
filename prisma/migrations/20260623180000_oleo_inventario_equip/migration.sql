-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('IN', 'OUT', 'ADJUST');

-- CreateTable
CREATE TABLE "oil_collections" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "supplierId" TEXT,
    "operationalDate" TEXT NOT NULL,
    "liters" DECIMAL(10,2) NOT NULL,
    "pricePerLiter" DECIMAL(10,4) NOT NULL,
    "totalValue" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT,
    "collectorName" TEXT,
    "observation" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oil_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supplierId" TEXT,
    "category" TEXT,
    "unitLabel" TEXT NOT NULL DEFAULT 'un',
    "unitValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currentQty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minQty" DECIMAL(12,2),
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "qty" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "unitValue" DECIMAL(12,2),
    "note" TEXT,
    "operationalDate" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oil_collections_unitId_operationalDate_idx" ON "oil_collections"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "inventory_items_unitId_active_idx" ON "inventory_items"("unitId", "active");

-- CreateIndex
CREATE INDEX "inventory_movements_itemId_createdAt_idx" ON "inventory_movements"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_unitId_operationalDate_idx" ON "inventory_movements"("unitId", "operationalDate");

-- AddForeignKey
ALTER TABLE "oil_collections" ADD CONSTRAINT "oil_collections_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oil_collections" ADD CONSTRAINT "oil_collections_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oil_collections" ADD CONSTRAINT "oil_collections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

