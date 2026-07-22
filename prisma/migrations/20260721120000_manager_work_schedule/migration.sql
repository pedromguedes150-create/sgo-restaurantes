-- Horário de trabalho do gerente (padrão semanal) — base do calendário consolidado de gerência
CREATE TABLE "manager_work_schedules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekdays" JSONB NOT NULL DEFAULT '[]',
    "startTime" TEXT,
    "endTime" TEXT,
    "note" TEXT,
    "lastFolgaAlertAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "manager_work_schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manager_work_schedules_userId_key" ON "manager_work_schedules"("userId");
ALTER TABLE "manager_work_schedules" ADD CONSTRAINT "manager_work_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
