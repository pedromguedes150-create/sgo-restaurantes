-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED');

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "equipmentId" TEXT,
    "equipmentName" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "cost" DECIMAL(12,2),
    "deadline" TIMESTAMP(3),
    "occurrenceId" TEXT,
    "planId" TEXT,
    "openedById" TEXT,
    "openedByName" TEXT,
    "doneById" TEXT,
    "doneByName" TEXT,
    "doneAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "equipmentId" TEXT,
    "equipmentName" TEXT,
    "frequencyDays" INTEGER NOT NULL,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "lastDoneAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_plan_logs" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneById" TEXT,
    "doneByName" TEXT,
    "note" TEXT,

    CONSTRAINT "maintenance_plan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_tickets_unitId_status_idx" ON "maintenance_tickets"("unitId", "status");

-- CreateIndex
CREATE INDEX "maintenance_plans_unitId_active_idx" ON "maintenance_plans"("unitId", "active");

-- CreateIndex
CREATE INDEX "maintenance_plan_logs_planId_idx" ON "maintenance_plan_logs"("planId");

-- AddForeignKey
ALTER TABLE "maintenance_plan_logs" ADD CONSTRAINT "maintenance_plan_logs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "maintenance_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

