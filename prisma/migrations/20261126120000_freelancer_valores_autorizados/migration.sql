-- v1.226.0 — valores/hora ALTERNATIVOS autorizados do freelancer (aditiva).
CREATE TABLE "freelancer_alt_rates" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "dayType" "DayType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freelancer_alt_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "freelancer_alt_rates_unitId_dayType_idx" ON "freelancer_alt_rates"("unitId", "dayType");

CREATE UNIQUE INDEX "freelancer_alt_rates_unitId_dayType_value_key" ON "freelancer_alt_rates"("unitId", "dayType", "value");

ALTER TABLE "freelancer_alt_rates" ADD CONSTRAINT "freelancer_alt_rates_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
