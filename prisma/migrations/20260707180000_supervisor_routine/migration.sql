-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELED');

-- CreateTable
CREATE TABLE "supervisor_visits" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "supervisorName" TEXT NOT NULL,
    "scheduledDate" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'PLANNED',
    "feedback" TEXT,
    "checklistId" TEXT,
    "checklistName" TEXT,
    "checklistResults" JSONB,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_checklists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supervisor_visits_unitId_scheduledDate_idx" ON "supervisor_visits"("unitId", "scheduledDate");

-- CreateIndex
CREATE INDEX "supervisor_visits_supervisorId_status_idx" ON "supervisor_visits"("supervisorId", "status");
