-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('PENDING', 'JUSTIFIED');

-- CreateTable
CREATE TABLE "cancellation_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cancellation_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_imports" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellation_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "importId" TEXT,
    "couponNumber" TEXT NOT NULL,
    "cashOperator" TEXT,
    "value" DECIMAL(10,2) NOT NULL,
    "status" "CancellationStatus" NOT NULL DEFAULT 'PENDING',
    "reasonId" TEXT,
    "justificationNote" TEXT,
    "justifiedById" TEXT,
    "justifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cancellation_imports_unitId_operationalDate_idx" ON "cancellation_imports"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "cancellations_unitId_status_idx" ON "cancellations"("unitId", "status");

-- CreateIndex
CREATE INDEX "cancellations_unitId_operationalDate_idx" ON "cancellations"("unitId", "operationalDate");

-- AddForeignKey
ALTER TABLE "cancellation_imports" ADD CONSTRAINT "cancellation_imports_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_imports" ADD CONSTRAINT "cancellation_imports_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_importId_fkey" FOREIGN KEY ("importId") REFERENCES "cancellation_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "cancellation_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_justifiedById_fkey" FOREIGN KEY ("justifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
