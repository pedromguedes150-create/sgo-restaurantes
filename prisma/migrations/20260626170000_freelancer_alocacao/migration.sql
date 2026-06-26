-- AlterTable
ALTER TABLE "payment_requests" ADD COLUMN     "workEndTime" TEXT,
ADD COLUMN     "workSectorId" TEXT,
ADD COLUMN     "workStartTime" TEXT;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_workSectorId_fkey" FOREIGN KEY ("workSectorId") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

