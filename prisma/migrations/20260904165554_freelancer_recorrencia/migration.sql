-- AlterTable
ALTER TABLE "payment_requests" ADD COLUMN     "recurrent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weekCount" INTEGER;
