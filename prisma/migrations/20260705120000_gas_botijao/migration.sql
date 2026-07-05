-- CreateEnum
CREATE TYPE "GasKind" AS ENUM ('BULK', 'CYLINDER');

-- AlterTable
ALTER TABLE "gas_receipts" ADD COLUMN     "cylinderCount" INTEGER,
ADD COLUMN     "cylinderKg" INTEGER,
ADD COLUMN     "cylindersReturned" INTEGER,
ADD COLUMN     "kind" "GasKind" NOT NULL DEFAULT 'BULK';

