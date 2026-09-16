-- Controle de Pizzas — exclusivo da unidade com pizzaria.
--
-- Aditivo: nenhuma tabela existente perde coluna ou dado. As duas colunas novas
-- em "units" nascem com padrao, entao as unidades ja cadastradas seguem iguais
-- (has_pizzeria = false, sem link publico) ate alguem marcar a da pizzaria.
--
-- A unidade e identificada por MARCADOR de cadastro ("hasPizzeria"), nao pelo
-- nome fixo no codigo: corrigir a grafia de "Jardim Teresopolis" nao pode
-- derrubar o modulo, e abrir uma segunda pizzaria nao exige deploy.
--
-- Tamanho e ENUM e sabor e TABELA de propósito: o cruzamento futuro com a ficha
-- tecnica precisa de valores estaveis. Texto livre ("35 CM", "G", "calabreza")
-- nunca casaria com uma receita.

-- CreateEnum
CREATE TYPE "PizzaSize" AS ENUM ('CM25', 'CM30', 'CM35');

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "hasPizzeria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pizzaPublicToken" TEXT;

-- CreateTable
CREATE TABLE "pizza_flavors" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pizza_flavors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pizza_closings" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "observation" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pizza_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pizza_closing_items" (
    "id" TEXT NOT NULL,
    "closingId" TEXT NOT NULL,
    "size" "PizzaSize" NOT NULL,
    "flavorId" TEXT NOT NULL,
    "flavorName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "pizza_closing_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_pizzaPublicToken_key" ON "units"("pizzaPublicToken");

-- CreateIndex
CREATE INDEX "pizza_flavors_unitId_active_idx" ON "pizza_flavors"("unitId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "pizza_flavors_unitId_name_key" ON "pizza_flavors"("unitId", "name");

-- CreateIndex
CREATE INDEX "pizza_closings_unitId_operationalDate_idx" ON "pizza_closings"("unitId", "operationalDate");

-- CreateIndex
CREATE UNIQUE INDEX "pizza_closings_unitId_operationalDate_key" ON "pizza_closings"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "pizza_closing_items_flavorId_idx" ON "pizza_closing_items"("flavorId");

-- CreateIndex
CREATE UNIQUE INDEX "pizza_closing_items_closingId_size_flavorId_key" ON "pizza_closing_items"("closingId", "size", "flavorId");

-- AddForeignKey
ALTER TABLE "pizza_flavors" ADD CONSTRAINT "pizza_flavors_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_closings" ADD CONSTRAINT "pizza_closings_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_closings" ADD CONSTRAINT "pizza_closings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_closing_items" ADD CONSTRAINT "pizza_closing_items_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "pizza_closings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pizza_closing_items" ADD CONSTRAINT "pizza_closing_items_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "pizza_flavors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
