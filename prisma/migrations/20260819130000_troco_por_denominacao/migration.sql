-- AlterTable
ALTER TABLE "cash_change_requests" ADD COLUMN     "giveJson" JSONB,
ADD COLUMN     "needJson" JSONB,
ALTER COLUMN "note" DROP NOT NULL;

