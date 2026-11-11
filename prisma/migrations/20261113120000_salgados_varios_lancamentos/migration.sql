-- v1.203.0 — Salgados: vários lançamentos por dia, cada um com a sua foto. ADITIVA.
-- Cada dia já lançado vira UM lançamento (com a foto do dia), sem perder nada.

-- AlterTable
ALTER TABLE "waste_snack_discards" ADD COLUMN     "launchId" TEXT;

-- CreateTable
CREATE TABLE "waste_snack_launches" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "evidencePath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_snack_launches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waste_snack_launches_unitId_operationalDate_idx" ON "waste_snack_launches"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "waste_snack_discards_launchId_idx" ON "waste_snack_discards"("launchId");

-- AddForeignKey
ALTER TABLE "waste_snack_launches" ADD CONSTRAINT "waste_snack_launches_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;


INSERT INTO "waste_snack_launches" ("id", "unitId", "operationalDate", "evidencePath", "createdById", "createdAt", "updatedAt")
SELECT 'bf_' || md5(d."unitId" || '|' || d."operationalDate"), d."unitId", d."operationalDate", MAX(e."path"),
       (ARRAY_AGG(d."createdById" ORDER BY d."createdAt"))[1], MIN(d."createdAt"), MAX(d."createdAt")
FROM "waste_snack_discards" d
LEFT JOIN "waste_snack_day_evidences" e ON e."unitId" = d."unitId" AND e."operationalDate" = d."operationalDate"
GROUP BY d."unitId", d."operationalDate";

UPDATE "waste_snack_discards" d SET "launchId" = 'bf_' || md5(d."unitId" || '|' || d."operationalDate") WHERE d."launchId" IS NULL;
