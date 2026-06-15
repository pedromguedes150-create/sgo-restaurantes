-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('TWELVE36_ODD', 'TWELVE36_EVEN', 'SIX_ONE', 'FIVE_TWO', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DayStatus" AS ENUM ('WORK', 'OFF', 'FALTA_INJUST', 'FALTA_JUST', 'ATESTADO', 'FERIAS');

-- AlterTable
ALTER TABLE "workforce_allocations" ADD COLUMN     "shiftId" TEXT;

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "module" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedules" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "shiftId" TEXT,
    "customMask" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_plan_overrides" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "DayStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_plan_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_actuals" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "DayStatus" NOT NULL,
    "note" TEXT,
    "reason" TEXT,
    "attachmentPath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_module_key" ON "role_permissions"("role", "module");

-- CreateIndex
CREATE INDEX "shifts_unitId_idx" ON "shifts"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedules_collaboratorId_unitId_key" ON "employee_schedules"("collaboratorId", "unitId");

-- CreateIndex
CREATE INDEX "schedule_plan_overrides_unitId_date_idx" ON "schedule_plan_overrides"("unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_plan_overrides_collaboratorId_date_key" ON "schedule_plan_overrides"("collaboratorId", "date");

-- CreateIndex
CREATE INDEX "schedule_actuals_unitId_date_idx" ON "schedule_actuals"("unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_actuals_collaboratorId_date_key" ON "schedule_actuals"("collaboratorId", "date");

-- AddForeignKey
ALTER TABLE "workforce_allocations" ADD CONSTRAINT "workforce_allocations_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_plan_overrides" ADD CONSTRAINT "schedule_plan_overrides_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_plan_overrides" ADD CONSTRAINT "schedule_plan_overrides_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_actuals" ADD CONSTRAINT "schedule_actuals_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_actuals" ADD CONSTRAINT "schedule_actuals_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_actuals" ADD CONSTRAINT "schedule_actuals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
