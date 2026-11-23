-- v1.219.0 — Inventário de Utensílios: mais de um inventário por unidade (um por LOCAL).
-- ADITIVA: os inventários existentes ficam como "Restaurante".
ALTER TABLE "utensil_inventories" ADD COLUMN "local" TEXT NOT NULL DEFAULT 'Restaurante';
CREATE INDEX "utensil_inventories_unitId_local_status_idx" ON "utensil_inventories"("unitId", "local", "status");
