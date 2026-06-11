-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('RECEIVED', 'PAID', 'PROBLEM');

-- CreateEnum
CREATE TYPE "NoteSource" AS ENUM ('QRCODE', 'PHOTO', 'MANUAL');

-- CreateTable
CREATE TABLE "received_notes" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "source" "NoteSource" NOT NULL DEFAULT 'MANUAL',
    "accessKey" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierCnpj" TEXT,
    "number" TEXT,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "totalValue" DECIMAL(12,2) NOT NULL,
    "productType" TEXT,
    "observation" TEXT,
    "imagePath" TEXT,
    "status" "NoteStatus" NOT NULL DEFAULT 'RECEIVED',
    "problemNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "received_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "received_notes_unitId_status_idx" ON "received_notes"("unitId", "status");

-- CreateIndex
CREATE INDEX "received_notes_accessKey_idx" ON "received_notes"("accessKey");

-- AddForeignKey
ALTER TABLE "received_notes" ADD CONSTRAINT "received_notes_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_notes" ADD CONSTRAINT "received_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
