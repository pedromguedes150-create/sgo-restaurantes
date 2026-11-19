-- v1.217.0 — Solicitações ao RH: campos por tipo, motivo da urgência e anexos (ADITIVA).
ALTER TABLE "rh_demandas" ADD COLUMN     "anexos" JSONB,
ADD COLUMN     "detalhes" JSONB,
ADD COLUMN     "urgenciaMotivo" TEXT;
