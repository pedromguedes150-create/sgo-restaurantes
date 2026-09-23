-- CreateEnum
CREATE TYPE "SectorProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "product_sector_proposals" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "proposedSectorId" TEXT,
    "proposedSectorName" TEXT,
    "reason" TEXT,
    "status" "SectorProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "finalSectorId" TEXT,
    "finalSectorName" TEXT,

    CONSTRAINT "product_sector_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_sector_proposals_productId_key" ON "product_sector_proposals"("productId");

-- CreateIndex
CREATE INDEX "product_sector_proposals_status_idx" ON "product_sector_proposals"("status");

-- AddForeignKey
ALTER TABLE "product_sector_proposals" ADD CONSTRAINT "product_sector_proposals_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
