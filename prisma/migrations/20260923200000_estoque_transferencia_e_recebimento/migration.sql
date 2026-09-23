-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMoveType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "StockMoveType" ADD VALUE 'TRANSFER_IN';

-- AlterTable
ALTER TABLE "product_request_items" ADD COLUMN     "stockLotId" TEXT,
ADD COLUMN     "stockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "counterpartLotId" TEXT,
ADD COLUMN     "counterpartUnitId" TEXT;

