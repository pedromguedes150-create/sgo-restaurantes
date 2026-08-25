-- Registro do cancelamento na hora, com foto do cupom.
--
-- Aditiva: os cancelamentos existentes ficam com source = IMPORT (que é o que
-- eram) e sem foto/hora — o que é honesto, ninguém os fotografou.
CREATE TYPE "CancellationSource" AS ENUM ('IMPORT', 'MANUAL');

ALTER TABLE "cancellations" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "photoPath" TEXT,
ADD COLUMN     "registeredById" TEXT,
ADD COLUMN     "source" "CancellationSource" NOT NULL DEFAULT 'IMPORT';

ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
