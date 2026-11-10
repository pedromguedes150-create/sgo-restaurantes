-- v1.200.0 — Comandas: baixa definitiva encontrada passa por validação. ADITIVA.
ALTER TABLE "command_divergences" ADD COLUMN "needsValidation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "command_count_sessions" ADD COLUMN "closedValidation" JSONB;
