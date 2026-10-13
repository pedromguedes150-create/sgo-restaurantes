-- v1.166.0 — razões sociais ADICIONAIS do RH por unidade (aditiva).
-- CreateEnum
CREATE TYPE "RhVinculoCriterio" AS ENUM ('NOME', 'CNPJ');

-- CreateTable
CREATE TABLE "unit_rh_sources" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "rhName" TEXT NOT NULL,
    "cnpj" TEXT,
    "criterio" "RhVinculoCriterio" NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "unit_rh_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_rh_sources_rhName_key" ON "unit_rh_sources"("rhName");

-- CreateIndex
CREATE INDEX "unit_rh_sources_unitId_idx" ON "unit_rh_sources"("unitId");

-- AddForeignKey
ALTER TABLE "unit_rh_sources" ADD CONSTRAINT "unit_rh_sources_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
