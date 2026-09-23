-- AlterTable
ALTER TABLE "product_requests" ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "checkedById" TEXT,
ADD COLUMN     "checkedByName" TEXT;

