-- Férias informadas à mão + admissão corrigida (v1.154.0). Migração ADITIVA.
-- AlterTable
ALTER TABLE "collaborators" ADD COLUMN     "hireDateManual" TEXT,
ADD COLUMN     "hireDateManualAt" TIMESTAMP(3),
ADD COLUMN     "hireDateManualBy" TEXT,
ADD COLUMN     "hireDateManualNote" TEXT;

-- CreateTable
CREATE TABLE "vacation_period_adjusts" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "periodoInicio" TEXT NOT NULL,
    "diasGozados" INTEGER NOT NULL,
    "observacao" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacation_period_adjusts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacation_period_adjusts_unitId_idx" ON "vacation_period_adjusts"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_period_adjusts_collaboratorId_periodoInicio_key" ON "vacation_period_adjusts"("collaboratorId", "periodoInicio");

-- AddForeignKey
ALTER TABLE "vacation_period_adjusts" ADD CONSTRAINT "vacation_period_adjusts_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
