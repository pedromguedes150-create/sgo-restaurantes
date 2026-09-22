-- CreateEnum
CREATE TYPE "OrderPackUnit" AS ENUM ('UN', 'FARDO', 'DISPLAY', 'CAIXA');

-- AlterTable
ALTER TABLE "product_request_items" ADD COLUMN     "packUnit" "OrderPackUnit" NOT NULL DEFAULT 'UN';
