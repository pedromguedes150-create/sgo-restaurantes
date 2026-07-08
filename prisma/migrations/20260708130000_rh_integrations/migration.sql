-- CreateEnum
CREATE TYPE "RhEventStatus" AS ENUM ('PROCESSED', 'RECEIVED', 'ERROR');

-- CreateTable
CREATE TABLE "rh_inbound_events" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "RhEventStatus" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_inbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_schedule_notices" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_schedule_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rh_inbound_events_createdAt_idx" ON "rh_inbound_events"("createdAt");

-- CreateIndex
CREATE INDEX "rh_schedule_notices_unitId_date_idx" ON "rh_schedule_notices"("unitId", "date");

-- CreateIndex
CREATE INDEX "rh_schedule_notices_createdAt_idx" ON "rh_schedule_notices"("createdAt");
