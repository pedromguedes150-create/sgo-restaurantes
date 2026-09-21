-- CreateTable
CREATE TABLE "ticket_media_participations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedByName" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_media_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_media_entries" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "coupons" INTEGER NOT NULL,
    "grossSales" DECIMAL(14,2) NOT NULL,
    "discounts" DECIMAL(14,2) NOT NULL,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "skippedDetail" TEXT,
    "fileName" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "importedByName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "replacedByName" TEXT,
    "replacedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ticket_media_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_media_participations_unitId_startsAt_idx" ON "ticket_media_participations"("unitId", "startsAt");

-- CreateIndex
CREATE INDEX "ticket_media_entries_competence_idx" ON "ticket_media_entries"("competence");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_media_entries_unitId_competence_key" ON "ticket_media_entries"("unitId", "competence");

-- AddForeignKey
ALTER TABLE "ticket_media_participations" ADD CONSTRAINT "ticket_media_participations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_media_entries" ADD CONSTRAINT "ticket_media_entries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
