-- Análise antifraude de cancelamentos (Teknisa PDF)
CREATE TABLE "cancellation_analyses" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "filial" TEXT,
    "period" TEXT,
    "fileName" TEXT,
    "totalCount" INTEGER NOT NULL,
    "totalValue" DECIMAL(12,2) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cancellation_analyses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cancellation_analyses_unitId_createdAt_idx" ON "cancellation_analyses"("unitId", "createdAt");
