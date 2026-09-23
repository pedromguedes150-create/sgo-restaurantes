-- AlterTable
ALTER TABLE "product_barcodes" ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "product_barcode_changes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromProductId" TEXT,
    "fromProductName" TEXT,
    "toProductId" TEXT,
    "toProductName" TEXT,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_barcode_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_barcode_changes_code_idx" ON "product_barcode_changes"("code");

-- CreateIndex
CREATE INDEX "product_barcode_changes_fromProductId_idx" ON "product_barcode_changes"("fromProductId");

-- CreateIndex
CREATE INDEX "product_barcode_changes_toProductId_idx" ON "product_barcode_changes"("toProductId");

-- CreateIndex
CREATE INDEX "product_barcodes_reviewedAt_idx" ON "product_barcodes"("reviewedAt");

