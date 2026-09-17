-- Fechamento de pizzas por CANAL (Teknisa / iFood) e tamanho.
--
-- ADITIVA de proposito. `pizza_closing_items` e `pizza_flavors` continuam de pe:
-- os fechamentos ja gravados por sabor sao historico que ninguem tem como
-- refazer, e derrubar tabela e migracao destrutiva (combinar com o Pedro).
-- O painel soma as contagens novas e cai nos itens antigos quando o dia nao
-- tiver contagem.
CREATE TYPE "PizzaChannel" AS ENUM ('TEKNISA', 'IFOOD');

CREATE TABLE "pizza_closing_counts" (
    "id" TEXT NOT NULL,
    "closingId" TEXT NOT NULL,
    "channel" "PizzaChannel" NOT NULL,
    "size" "PizzaSize" NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "pizza_closing_counts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pizza_closing_counts_closingId_idx" ON "pizza_closing_counts"("closingId");
CREATE UNIQUE INDEX "pizza_closing_counts_closingId_channel_size_key" ON "pizza_closing_counts"("closingId", "channel", "size");

ALTER TABLE "pizza_closing_counts" ADD CONSTRAINT "pizza_closing_counts_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "pizza_closings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
