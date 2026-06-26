-- CreateTable
CREATE TABLE "workforce_day_snapshots" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,
    "shiftLabel" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workforce_day_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workforce_day_snapshots_unitId_date_idx" ON "workforce_day_snapshots"("unitId", "date");

-- AddForeignKey
ALTER TABLE "workforce_day_snapshots" ADD CONSTRAINT "workforce_day_snapshots_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

