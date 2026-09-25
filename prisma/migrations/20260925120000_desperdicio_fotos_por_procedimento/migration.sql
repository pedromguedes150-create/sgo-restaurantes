-- Evidência fotográfica por procedimento (Restaurante) e foto geral (Salgados).
-- Migração ADITIVA: apenas adiciona tabelas. Lançamentos existentes não são alterados.

-- Foto por tipo de sobra (SS_ALMOCO | SS_JANTAR | PROD_ALMOCO | PROD_JANTAR)
-- dentro de um lançamento de desperdício do restaurante.
CREATE TABLE "waste_entry_photos" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waste_entry_photos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "waste_entry_photos_entryId_typeCode_key" ON "waste_entry_photos"("entryId", "typeCode");
ALTER TABLE "waste_entry_photos" ADD CONSTRAINT "waste_entry_photos_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "waste_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foto geral do recipiente de descarte — UMA por unidade/dia operacional de salgados.
CREATE TABLE "waste_snack_day_evidences" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "waste_snack_day_evidences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "waste_snack_day_evidences_unitId_operationalDate_key" ON "waste_snack_day_evidences"("unitId", "operationalDate");
ALTER TABLE "waste_snack_day_evidences" ADD CONSTRAINT "waste_snack_day_evidences_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waste_snack_day_evidences" ADD CONSTRAINT "waste_snack_day_evidences_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
