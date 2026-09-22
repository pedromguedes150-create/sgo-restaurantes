-- CreateEnum
CREATE TYPE "PackType" AS ENUM ('UN', 'FARDO', 'DISPLAY');

-- CreateEnum
CREATE TYPE "StockLotStatus" AS ENUM ('OPEN', 'FINISHED', 'DISCARDED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('ENTRY', 'COUNT', 'DISCARD', 'FINISH', 'ADJUST');

-- AlterEnum
ALTER TYPE "ProductOrigin" ADD VALUE 'LOCAL';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "alertDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "packType" "PackType" NOT NULL DEFAULT 'UN',
ADD COLUMN     "trackExpiry" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lotCode" TEXT,
    "expiresAt" TEXT,
    "qtyReceived" DECIMAL(12,3) NOT NULL,
    "qtyOnHand" DECIMAL(12,3) NOT NULL,
    "packType" "PackType" NOT NULL DEFAULT 'UN',
    "unitsPerPack" INTEGER NOT NULL DEFAULT 1,
    "status" "StockLotStatus" NOT NULL DEFAULT 'OPEN',
    "lastReviewBand" TEXT,
    "lastReviewAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedByName" TEXT,
    "closeNote" TEXT,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "StockMoveType" NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "qtyAfter" DECIMAL(12,3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_lots_unitId_status_idx" ON "stock_lots"("unitId", "status");

-- CreateIndex
CREATE INDEX "stock_lots_unitId_expiresAt_idx" ON "stock_lots"("unitId", "expiresAt");

-- CreateIndex
CREATE INDEX "stock_lots_productId_idx" ON "stock_lots"("productId");

-- CreateIndex
CREATE INDEX "stock_movements_lotId_idx" ON "stock_movements"("lotId");

-- CreateIndex
CREATE INDEX "stock_movements_unitId_createdAt_idx" ON "stock_movements"("unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "stock_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
