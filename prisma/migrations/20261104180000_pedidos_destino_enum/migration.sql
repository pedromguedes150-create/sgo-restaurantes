-- v1.187.0 — Pedidos por setor: o Almoxarifado é o terceiro destino (ao lado de CD e Fábrica).
-- Só o valor do enum nesta migração: o Postgres não deixa USAR um valor novo de enum na
-- mesma transação em que ele foi criado — o resto vem na migração seguinte.
ALTER TYPE "SectorOrderDestination" ADD VALUE 'ALMOXARIFADO';
