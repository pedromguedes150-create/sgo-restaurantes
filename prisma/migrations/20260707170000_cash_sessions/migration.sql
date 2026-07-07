-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "openingAmount" DECIMAL(10,2) NOT NULL,
    "expectedOpening" DECIMAL(10,2),
    "divergence" DECIMAL(10,2),
    "closingAmount" DECIMAL(10,2),
    "note" TEXT,
    "openedById" TEXT NOT NULL,
    "openedByName" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedByName" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_unitId_operationalDate_seq_key" ON "cash_sessions"("unitId", "operationalDate", "seq");

-- CreateIndex
CREATE INDEX "cash_sessions_unitId_operationalDate_idx" ON "cash_sessions"("unitId", "operationalDate");
