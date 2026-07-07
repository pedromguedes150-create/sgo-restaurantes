-- AlterEnum
ALTER TYPE "VacationStatus" ADD VALUE 'REQUESTED';

-- CreateTable
CREATE TABLE "schedule_changes" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "collaboratorAId" TEXT NOT NULL,
    "collaboratorAName" TEXT NOT NULL,
    "dateA" TEXT NOT NULL,
    "collaboratorBId" TEXT,
    "collaboratorBName" TEXT,
    "dateB" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_changes_unitId_createdAt_idx" ON "schedule_changes"("unitId", "createdAt");
