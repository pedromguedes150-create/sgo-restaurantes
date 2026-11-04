-- v1.185.0 — Pedidos por setor: a lista escrita (como um e-mail) que a unidade manda
-- ao CD ou à Fábrica, um bloco por setor, com situação por setor. ADITIVA: os
-- Pedidos Internos por produto (product_requests) não são tocados.

-- CreateEnum
CREATE TYPE "SectorOrderDestination" AS ENUM ('CD', 'FABRICA');

-- CreateEnum
CREATE TYPE "SectorOrderStatus" AS ENUM ('ENVIADO', 'RECEBIDO', 'ATENDIDO');

-- CreateTable
CREATE TABLE "sector_orders" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "unitId" TEXT NOT NULL,
    "destination" "SectorOrderDestination" NOT NULL,
    "status" "SectorOrderStatus" NOT NULL DEFAULT 'ENVIADO',
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sector_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sector_order_sections" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sectorId" TEXT,
    "sectorName" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "lines" TEXT[],
    "status" "SectorOrderStatus" NOT NULL DEFAULT 'ENVIADO',
    "receivedById" TEXT,
    "receivedByName" TEXT,
    "receivedAt" TIMESTAMP(3),
    "attendedById" TEXT,
    "attendedByName" TEXT,
    "attendedAt" TIMESTAMP(3),

    CONSTRAINT "sector_order_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sector_orders_number_key" ON "sector_orders"("number");

-- CreateIndex
CREATE INDEX "sector_orders_unitId_sentAt_idx" ON "sector_orders"("unitId", "sentAt");

-- CreateIndex
CREATE INDEX "sector_orders_status_sentAt_idx" ON "sector_orders"("status", "sentAt");

-- CreateIndex
CREATE INDEX "sector_order_sections_orderId_idx" ON "sector_order_sections"("orderId");

-- CreateIndex
CREATE INDEX "sector_order_sections_sectorId_status_idx" ON "sector_order_sections"("sectorId", "status");

-- AddForeignKey
ALTER TABLE "sector_orders" ADD CONSTRAINT "sector_orders_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sector_order_sections" ADD CONSTRAINT "sector_order_sections_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sector_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
