-- Hora Extra por período + valor/hora autorizado por unidade (v1.130.0). ADITIVA.
-- AlterTable
ALTER TABLE "payment_requests" ADD COLUMN     "hourlyRate" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "overtime_hourly_rates" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_hourly_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "overtime_hourly_rates_unitId_value_key" ON "overtime_hourly_rates"("unitId", "value");

-- AddForeignKey
ALTER TABLE "overtime_hourly_rates" ADD CONSTRAINT "overtime_hourly_rates_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

