-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('WEEKDAY', 'WEEKEND', 'HOLIDAY');

-- AlterTable
ALTER TABLE "payment_requests" ADD COLUMN     "transportValue" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "freelancer_hourly_rates" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "dayType" "DayType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "freelancer_hourly_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "freelancer_hourly_rates_unitId_dayType_key" ON "freelancer_hourly_rates"("unitId", "dayType");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- AddForeignKey
ALTER TABLE "freelancer_hourly_rates" ADD CONSTRAINT "freelancer_hourly_rates_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

