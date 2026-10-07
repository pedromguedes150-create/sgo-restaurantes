-- Dias de funcionamento da unidade (v1.157.0). ADITIVA: toda unidade nasce com os 7 dias.
ALTER TABLE "units" ADD COLUMN "operatingDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[];
