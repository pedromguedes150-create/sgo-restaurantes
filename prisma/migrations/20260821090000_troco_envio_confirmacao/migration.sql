-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChangeRequestStatus" ADD VALUE 'SENT';
ALTER TYPE "ChangeRequestStatus" ADD VALUE 'RECEIVED';

-- AlterTable
ALTER TABLE "cash_change_requests" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "receivedByName" TEXT,
ADD COLUMN     "receivedJson" JSONB,
ADD COLUMN     "receivedNote" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentById" TEXT,
ADD COLUMN     "sentByName" TEXT,
ADD COLUMN     "sentJson" JSONB,
ADD COLUMN     "sentNote" TEXT;

