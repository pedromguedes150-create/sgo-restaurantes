-- CreateEnum
CREATE TYPE "UtensilInventoryStatus" AS ENUM ('RASCUNHO', 'PENDENTE', 'EM_CORRECAO', 'APROVADO');

-- CreateEnum
CREATE TYPE "UtensilEventKind" AS ENUM ('CRIADO', 'ENVIADO', 'DEVOLVIDO', 'REENVIADO', 'AUDITADO', 'APROVADO');

-- CreateTable
CREATE TABLE "utensil_catalog_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utensil_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utensil_inventories" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "UtensilInventoryStatus" NOT NULL DEFAULT 'RASCUNHO',
    "managerId" TEXT NOT NULL,
    "managerName" TEXT NOT NULL,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "firstSentAt" TIMESTAMP(3),
    "auditorId" TEXT,
    "auditorName" TEXT,
    "auditNotes" TEXT,
    "returnReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utensil_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utensil_inventory_items" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER,
    "auditedQuantity" INTEGER,
    "custom" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "utensil_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utensil_inventory_events" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "kind" "UtensilEventKind" NOT NULL,
    "byId" TEXT,
    "byName" TEXT NOT NULL,
    "note" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utensil_inventory_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "utensil_inventories_unitId_status_idx" ON "utensil_inventories"("unitId", "status");

-- CreateIndex
CREATE INDEX "utensil_inventories_unitId_sentAt_idx" ON "utensil_inventories"("unitId", "sentAt");

-- CreateIndex
CREATE INDEX "utensil_inventory_items_inventoryId_idx" ON "utensil_inventory_items"("inventoryId");

-- CreateIndex
CREATE INDEX "utensil_inventory_events_inventoryId_createdAt_idx" ON "utensil_inventory_events"("inventoryId", "createdAt");

-- AddForeignKey
ALTER TABLE "utensil_inventory_items" ADD CONSTRAINT "utensil_inventory_items_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "utensil_inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utensil_inventory_events" ADD CONSTRAINT "utensil_inventory_events_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "utensil_inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
