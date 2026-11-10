-- v1.201.0 — Comandas: programação das conferências (regra) separada do cadastro físico. ADITIVA.

-- CreateTable
CREATE TABLE "command_schedules" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CommandSessionType" NOT NULL,
    "weekdays" INTEGER[],
    "startHour" INTEGER,
    "endHour" INTEGER,
    "rangeStart" INTEGER,
    "rangeEnd" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_schedule_exceptions" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skip" BOOLEAN NOT NULL DEFAULT false,
    "type" "CommandSessionType",
    "rangeStart" INTEGER,
    "rangeEnd" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "command_schedules_unitId_idx" ON "command_schedules"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "command_schedule_exceptions_unitId_date_key" ON "command_schedule_exceptions"("unitId", "date");

-- AddForeignKey
ALTER TABLE "command_schedules" ADD CONSTRAINT "command_schedules_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_schedule_exceptions" ADD CONSTRAINT "command_schedule_exceptions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

