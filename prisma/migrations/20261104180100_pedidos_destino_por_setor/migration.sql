-- v1.187.0 — o DESTINO é do SETOR, não do pedido (decisão do Pedro, 04/11/2026):
-- cada Setor do CD diz para onde vai (Fábrica · CD · Almoxarifado) e o bloco do pedido
-- leva esse destino congelado. O pedido é UM só.
--
-- ⚠️ Os pedidos por setor gravados até aqui eram TESTE (Daniel, 04/11) e são apagados
-- junto com a coluna "destination" de sector_orders — a única parte destrutiva.

DELETE FROM "sector_orders";
ALTER TABLE "sector_orders" DROP COLUMN "destination";

ALTER TABLE "cd_sectors" ADD COLUMN "destination" "SectorOrderDestination" NOT NULL DEFAULT 'CD';
ALTER TABLE "sector_order_sections" ADD COLUMN "destination" "SectorOrderDestination" NOT NULL DEFAULT 'CD';
CREATE INDEX "sector_order_sections_destination_status_idx" ON "sector_order_sections"("destination", "status");

-- A tabela do Pedro, pelo NOME do setor (sem acento, caixa alta): Câmaras Frias, Salgados,
-- Confeitaria e Carnes → Fábrica; Almoxarifado → Almoxarifado; o resto fica em CD
-- (Descartáveis, Bebidas, Secos, Bombonière). O mesmo critério de `destinoSugeridoPeloNome`.
UPDATE "cd_sectors" SET "destination" = 'FABRICA'
 WHERE translate(upper("name"), 'ÂÁÀÃÄÉÊËÍÎÏÓÔÕÖÚÛÜÇ', 'AAAAAEEEIIIOOOOUUUC') ~ '(CAMARA|SALGAD|CONFEIT|CARNE|CHURRAS)';
UPDATE "cd_sectors" SET "destination" = 'ALMOXARIFADO'
 WHERE translate(upper("name"), 'ÂÁÀÃÄÉÊËÍÎÏÓÔÕÖÚÛÜÇ', 'AAAAAEEEIIIOOOOUUUC') ~ 'ALMOX';
