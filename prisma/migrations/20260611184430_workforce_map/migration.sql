-- CreateTable
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minHeadcount" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workforce_allocations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "collaboratorId" TEXT,
    "collaboratorName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workforce_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sectors_unitId_idx" ON "sectors"("unitId");

-- CreateIndex
CREATE INDEX "workforce_allocations_unitId_sectorId_idx" ON "workforce_allocations"("unitId", "sectorId");

-- AddForeignKey
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_allocations" ADD CONSTRAINT "workforce_allocations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_allocations" ADD CONSTRAINT "workforce_allocations_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_allocations" ADD CONSTRAINT "workforce_allocations_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
