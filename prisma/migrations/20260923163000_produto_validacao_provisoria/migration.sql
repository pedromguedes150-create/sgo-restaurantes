-- CreateEnum
CREATE TYPE "ProductValidation" AS ENUM ('VALIDADO', 'PENDENTE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validatedById" TEXT,
ADD COLUMN     "validation" "ProductValidation" NOT NULL DEFAULT 'VALIDADO';

