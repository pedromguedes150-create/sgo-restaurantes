-- CreateEnum
CREATE TYPE "PopRecurrence" AS ENUM ('ONCE', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('PENDING', 'DONE', 'MISSED');

-- AlterTable
ALTER TABLE "pops" ADD COLUMN     "isInitial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrence" "PopRecurrence" NOT NULL DEFAULT 'ONCE';

-- CreateTable
CREATE TABLE "pop_sectors" (
    "id" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,

    CONSTRAINT "pop_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_records" (
    "id" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "popVersion" INTEGER NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sectorName" TEXT,
    "periodKey" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "pop_sectors_popId_sectorName_key" ON "pop_sectors"("popId", "sectorName");

-- CreateIndex
CREATE INDEX "training_records_unitId_status_idx" ON "training_records"("unitId", "status");

-- CreateIndex
CREATE INDEX "training_records_collaboratorId_idx" ON "training_records"("collaboratorId");

-- CreateIndex
CREATE UNIQUE INDEX "training_records_popId_collaboratorId_periodKey_key" ON "training_records"("popId", "collaboratorId", "periodKey");

-- AddForeignKey
ALTER TABLE "pop_sectors" ADD CONSTRAINT "pop_sectors_popId_fkey" FOREIGN KEY ("popId") REFERENCES "pops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_popId_fkey" FOREIGN KEY ("popId") REFERENCES "pops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
