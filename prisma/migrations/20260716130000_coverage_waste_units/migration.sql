-- CreateTable (cobertura temporária de setor — valor por dia)
CREATE TABLE "freelancer_sector_rates" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,
    "dayValue" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "freelancer_sector_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "freelancer_sector_rates_freelancerId_sectorName_key" ON "freelancer_sector_rates"("freelancerId", "sectorName");
ALTER TABLE "freelancer_sector_rates" ADD CONSTRAINT "freelancer_sector_rates_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "freelancers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (setor coberto no lançamento)
ALTER TABLE "payment_requests" ADD COLUMN "coverageSector" TEXT;

-- AlterTable (desperdício: unidade de medida + sub-itens)
ALTER TABLE "waste_categories" ADD COLUMN "measure" TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE "waste_entry_items" ADD COLUMN "subItems" JSONB;
