-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('PENDING', 'DONE', 'MISSED');

-- CreateEnum
CREATE TYPE "CollaboratorSource" AS ENUM ('RH', 'MANUAL');

-- CreateEnum
CREATE TYPE "VacationStatus" AS ENUM ('CONFIRMED', 'CHANGE_REQUESTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ScheduleVariation" AS ENUM ('NONE', 'ABSENCE', 'LATE', 'SWAP');

-- CreateEnum
CREATE TYPE "PopStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "inventory_schedules" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "scheduledDate" TEXT NOT NULL,
    "responsibleId" TEXT,
    "status" "InventoryStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "CollaboratorSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborator_units" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "collaborator_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacations" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "VacationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_entries" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "planned" TEXT NOT NULL,
    "variation" "ScheduleVariation" NOT NULL DEFAULT 'NONE',
    "variationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pops" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "sector" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PopStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pop_units" (
    "id" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "pop_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pop_reads" (
    "id" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pop_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_schedules_unitId_scheduledDate_idx" ON "inventory_schedules"("unitId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "collaborator_units_collaboratorId_unitId_key" ON "collaborator_units"("collaboratorId", "unitId");

-- CreateIndex
CREATE INDEX "vacations_unitId_idx" ON "vacations"("unitId");

-- CreateIndex
CREATE INDEX "schedule_entries_unitId_date_idx" ON "schedule_entries"("unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "pop_units_popId_unitId_key" ON "pop_units"("popId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "pop_reads_popId_userId_version_key" ON "pop_reads"("popId", "userId", "version");

-- AddForeignKey
ALTER TABLE "inventory_schedules" ADD CONSTRAINT "inventory_schedules_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_schedules" ADD CONSTRAINT "inventory_schedules_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_schedules" ADD CONSTRAINT "inventory_schedules_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborator_units" ADD CONSTRAINT "collaborator_units_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborator_units" ADD CONSTRAINT "collaborator_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pop_units" ADD CONSTRAINT "pop_units_popId_fkey" FOREIGN KEY ("popId") REFERENCES "pops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pop_units" ADD CONSTRAINT "pop_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pop_reads" ADD CONSTRAINT "pop_reads_popId_fkey" FOREIGN KEY ("popId") REFERENCES "pops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pop_reads" ADD CONSTRAINT "pop_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
