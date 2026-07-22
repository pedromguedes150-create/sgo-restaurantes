-- Solicitação de Produtos (Fase 1): catálogo + pedidos
CREATE TYPE "ProductOrigin" AS ENUM ('FABRICA', 'CD');
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" "ProductOrigin" NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "measure" TEXT NOT NULL DEFAULT 'un',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "products_active_category_idx" ON "products"("active", "category");
CREATE TABLE "product_requests" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "origin" "ProductOrigin" NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "note" TEXT,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    CONSTRAINT "product_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "product_requests_unitId_createdAt_idx" ON "product_requests"("unitId", "createdAt");
CREATE INDEX "product_requests_origin_status_idx" ON "product_requests"("origin", "status");
