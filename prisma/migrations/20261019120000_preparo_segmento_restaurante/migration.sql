-- Padronização de Preparo (v1.172.0): abas LANCHONETE × RESTAURANTE.
-- Migração ADITIVA: toda ficha existente fica em LANCHONETE pelo padrão.
CREATE TYPE "PrepSegment" AS ENUM ('LANCHONETE', 'RESTAURANTE');
ALTER TABLE "prep_standards" ADD COLUMN "segment" "PrepSegment" NOT NULL DEFAULT 'LANCHONETE';
ALTER TABLE "prep_standards" ADD COLUMN "ovenMode" TEXT;
ALTER TABLE "prep_standards" ADD COLUMN "temperature" TEXT;
ALTER TABLE "prep_standards" ADD COLUMN "cookTime" TEXT;
CREATE INDEX "prep_standards_segment_status_idx" ON "prep_standards"("segment", "status");
