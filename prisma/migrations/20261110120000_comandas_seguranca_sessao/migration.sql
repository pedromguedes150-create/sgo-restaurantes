-- v1.200.0 — Comandas: sessão imutável (resultado congelado), reivindicação da
-- finalização, mudança de escopo com autorização e vínculo contagem ↔ sessão. ADITIVA.

ALTER TABLE "command_counts" ADD COLUMN "sessionId" TEXT;

ALTER TABLE "command_count_sessions"
  ADD COLUMN "closedScope" JSONB,
  ADD COLUMN "closedAbsent" JSONB,
  ADD COLUMN "closedLost" JSONB,
  ADD COLUMN "closedRecovered" JSONB,
  ADD COLUMN "closedExpected" INTEGER,
  ADD COLUMN "closingAt" TIMESTAMP(3),
  ADD COLUMN "scopeChangedAt" TIMESTAMP(3),
  ADD COLUMN "scopeChangedById" TEXT,
  ADD COLUMN "scopeChangeReason" TEXT;
