-- Análise de comandas em aberto (antifraude das 2 comandas)
CREATE TABLE "open_command_analyses" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "cutDate" TEXT NOT NULL,
    "fileName" TEXT,
    "totalCommands" INTEGER NOT NULL,
    "suspectCount" INTEGER NOT NULL,
    "suspectValue" DECIMAL(12,2) NOT NULL,
    "suspects" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "open_command_analyses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "open_command_analyses_unitId_createdAt_idx" ON "open_command_analyses"("unitId", "createdAt");
