-- v1.198.0 — Central de Atestados e Afins, etapa C: configuração por nomenclatura
-- (nome no RH, ativa, duração da regra). ADITIVA.

CREATE TABLE "certificate_nomenclature_configs" (
  "id" TEXT NOT NULL,
  "nomenclature" TEXT NOT NULL,
  "rhName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "ruleDays" INTEGER,
  "notes" TEXT,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "certificate_nomenclature_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificate_nomenclature_configs_nomenclature_key" ON "certificate_nomenclature_configs"("nomenclature");
