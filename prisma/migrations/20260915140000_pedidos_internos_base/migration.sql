-- PEDIDOS INTERNOS — a base (entrega 1 de 4).
--
-- O que existia: UM pedido por origem, com os itens dentro de um campo JSON e o
-- status numa string livre. Nao havia setor do CD, separacao por item, perfil
-- de separador nem codigo de barras alternativo.
--
-- ADITIVO. O `items` (JSON) continua na tabela e nao e apagado: a migracao
-- COPIA o conteudo dele para product_request_items, e o historico antigo segue
-- legivel exatamente como foi gravado.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SEPARATOR';

-- AlterTable
ALTER TABLE "product_requests" ADD COLUMN     "cdNote" TEXT,
ADD COLUMN     "receiptNote" TEXT,
ADD COLUMN     "receiptPackaging" TEXT,
ADD COLUMN     "receiptQuality" TEXT,
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "receivedByName" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentById" TEXT,
ADD COLUMN     "sentByName" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "cdSectorId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cdSectorId" TEXT;

-- CreateTable
CREATE TABLE "cd_sectors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cd_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_barcodes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "measure" TEXT NOT NULL DEFAULT 'un',
    "cdSectorId" TEXT,
    "cdSectorName" TEXT,
    "qtyRequested" DECIMAL(12,3) NOT NULL,
    "qtySeparated" DECIMAL(12,3),
    "missingReason" TEXT,
    "separatedById" TEXT,
    "separatedByName" TEXT,
    "separatedAt" TIMESTAMP(3),
    "receiptIssue" TEXT,
    "receiptNote" TEXT,
    "receiptPhoto" TEXT,

    CONSTRAINT "product_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cd_sectors_name_key" ON "cd_sectors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_barcodes_code_key" ON "product_barcodes"("code");

-- CreateIndex
CREATE INDEX "product_barcodes_productId_idx" ON "product_barcodes"("productId");

-- CreateIndex
CREATE INDEX "product_request_items_requestId_idx" ON "product_request_items"("requestId");

-- CreateIndex
CREATE INDEX "product_request_items_cdSectorId_idx" ON "product_request_items"("cdSectorId");

-- CreateIndex
CREATE INDEX "products_cdSectorId_idx" ON "products"("cdSectorId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cdSectorId_fkey" FOREIGN KEY ("cdSectorId") REFERENCES "cd_sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_cdSectorId_fkey" FOREIGN KEY ("cdSectorId") REFERENCES "cd_sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_request_items" ADD CONSTRAINT "product_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "product_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_request_items" ADD CONSTRAINT "product_request_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_request_items" ADD CONSTRAINT "product_request_items_cdSectorId_fkey" FOREIGN KEY ("cdSectorId") REFERENCES "cd_sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 1) Os quatro setores do CD ───────────────────────────────────────────────
-- Nomes iniciais; o Admin renomeia e acrescenta. Nada no codigo depende de
-- serem quatro.
INSERT INTO "cd_sectors" ("id", "name", "order", "active", "createdAt") VALUES
  (gen_random_uuid()::text, 'Bebidas',      10, true, now()),
  (gen_random_uuid()::text, 'Secos',        20, true, now()),
  (gen_random_uuid()::text, 'Refrigerados', 30, true, now()),
  (gen_random_uuid()::text, 'Descartáveis', 40, true, now())
ON CONFLICT ("name") DO NOTHING;

-- ── 2) O codigo de barras que ja existia vira o primeiro da lista ────────────
-- Assim bipar continua funcionando no dia da subida, e os codigos novos entram
-- ao lado em vez de substituir.
INSERT INTO "product_barcodes" ("id", "productId", "code", "createdAt")
SELECT gen_random_uuid()::text, "id", "barcode", now()
  FROM "products"
 WHERE "barcode" IS NOT NULL AND btrim("barcode") <> ''
ON CONFLICT ("code") DO NOTHING;

-- ── 3) Os itens saem do JSON e viram linha ───────────────────────────────────
-- `jsonb_array_elements` sobre o campo antigo. Pedido cujo JSON nao for um
-- array (nunca deveria, mas dado velho surpreende) simplesmente nao gera linha,
-- em vez de derrubar a migracao inteira.
INSERT INTO "product_request_items"
  ("id", "requestId", "productId", "name", "category", "measure", "qtyRequested")
SELECT
  gen_random_uuid()::text,
  r."id",
  -- So copia o productId se o produto AINDA EXISTIR. A coluna agora tem chave
  -- estrangeira, e pedido antigo que aponta para produto ja apagado derrubaria
  -- a migracao INTEIRA. O nome fica no snapshot `name`, entao nada se perde.
  (SELECT pr."id" FROM "products" pr WHERE pr."id" = NULLIF(i->>'productId', '')),
  COALESCE(NULLIF(i->>'name', ''), 'Produto'),
  COALESCE(NULLIF(i->>'category', ''), 'Geral'),
  COALESCE(NULLIF(i->>'measure', ''), 'un'),
  COALESCE((i->>'qty')::numeric, 0)
FROM "product_requests" r
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(r."items"::jsonb) = 'array' THEN r."items"::jsonb ELSE '[]'::jsonb END
) AS i;

-- ── 4) O vocabulario de status do pedido ─────────────────────────────────────
-- A coluna e String (nao enum), entao a troca e um UPDATE. Os nomes novos sao
-- os do fluxo combinado; os antigos eram NEW/SEPARATING/SENT/RECEIVED.
UPDATE "product_requests" SET "status" = 'ENVIADO_CD'       WHERE "status" = 'NEW';
UPDATE "product_requests" SET "status" = 'SEPARANDO'        WHERE "status" = 'SEPARATING';
UPDATE "product_requests" SET "status" = 'ENVIADO_UNIDADE'  WHERE "status" = 'SENT';
UPDATE "product_requests" SET "status" = 'CONCLUIDO'        WHERE "status" = 'RECEIVED';
