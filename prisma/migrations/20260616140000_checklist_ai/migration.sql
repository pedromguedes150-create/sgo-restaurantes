-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN     "aiCheck" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referenceImagePath" TEXT,
ADD COLUMN     "standardDescription" TEXT;

