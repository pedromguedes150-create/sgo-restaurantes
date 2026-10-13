-- v1.166.0 — status "Afastado" do RH vira período e "AF" na Escala (aditiva).
-- AlterEnum
ALTER TYPE "DayStatus" ADD VALUE 'AFASTADO';

-- CreateTable
CREATE TABLE "rh_afastamentos" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "rhStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rh_afastamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rh_afastamentos_collaboratorId_endDate_idx" ON "rh_afastamentos"("collaboratorId", "endDate");

-- AddForeignKey
ALTER TABLE "rh_afastamentos" ADD CONSTRAINT "rh_afastamentos_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
