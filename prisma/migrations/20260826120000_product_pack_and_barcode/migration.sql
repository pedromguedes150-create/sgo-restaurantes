-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "packSize" INTEGER;

-- CreateIndex
CREATE INDEX "products_barcode_idx" ON "products"("barcode");

