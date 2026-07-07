-- CreateTable
CREATE TABLE "supervisor_visit_plans" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "frequencyDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "lastVisitAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_visit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_visit_plans_unitId_key" ON "supervisor_visit_plans"("unitId");

-- CreateIndex
CREATE INDEX "supervisor_visit_plans_nextDueAt_idx" ON "supervisor_visit_plans"("nextDueAt");
