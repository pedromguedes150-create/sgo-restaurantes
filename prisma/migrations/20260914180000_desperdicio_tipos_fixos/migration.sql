-- Desperdicio: a lista de tipos passa a ser FECHADA (decisao do Alan, 14/09).
--
-- Por que: com categorias livres por unidade nao existe consolidado possivel —
-- somar "Salao" de uma unidade com "Buffet almoco" de outra e somar coisas que
-- ninguem garantiu serem iguais. Os seis abaixo sao os mesmos em toda a rede.
--
-- ATENCAO ao ler um comparativo que atravesse esta data: o historico lancado nas
-- categorias antigas CONTINUA no banco (nada e apagado), mas antes e depois
-- medem coisas diferentes. A queda no grafico pode ser a virada, nao a operacao.

-- 1) Os seis tipos fixos. Idempotente pelo `code`, que e unico.
INSERT INTO "waste_categories" ("id", "code", "name", "measure", "order", "active", "createdAt")
VALUES
  (gen_random_uuid()::text, 'SS_ALMOCO',   'Self-service almoço',    'kg', 10, true, now()),
  (gen_random_uuid()::text, 'SS_JANTAR',   'Self-service jantar',    'kg', 20, true, now()),
  (gen_random_uuid()::text, 'REF_ALMOCO',  'Refeitório almoço',      'kg', 30, true, now()),
  (gen_random_uuid()::text, 'REF_JANTAR',  'Refeitório jantar',      'kg', 40, true, now()),
  (gen_random_uuid()::text, 'PROD_ALMOCO', 'Sobras produção almoço', 'kg', 50, true, now()),
  (gen_random_uuid()::text, 'PROD_JANTAR', 'Sobras produção jantar', 'kg', 60, true, now())
ON CONFLICT ("code") DO UPDATE
  SET "name" = EXCLUDED."name",
      "measure" = EXCLUDED."measure",
      "order" = EXCLUDED."order",
      "active" = true;

-- 2) As demais saem do lancamento. INATIVADAS, nao apagadas: o historico delas
--    continua legivel, e apagar levaria junto os waste_entry_items por FK.
UPDATE "waste_categories"
   SET "active" = false
 WHERE "code" NOT IN ('SS_ALMOCO','SS_JANTAR','REF_ALMOCO','REF_JANTAR','PROD_ALMOCO','PROD_JANTAR');
