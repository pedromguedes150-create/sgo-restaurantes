-- CreateTable (simulação de alocação p/ dia futuro do Mapa)
CREATE TABLE "workforce_simulations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "assignments" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workforce_simulations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workforce_simulations_unitId_date_key" ON "workforce_simulations"("unitId", "date");
