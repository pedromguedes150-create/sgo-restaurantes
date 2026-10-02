-- Escala: férias DERIVADA do período (v1.142.1). Aditiva.
ALTER TABLE "vacations" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SGO';
CREATE INDEX "vacations_collaboratorId_endDate_idx" ON "vacations"("collaboratorId", "endDate");
