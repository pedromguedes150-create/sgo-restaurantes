-- v1.180.0 — Configuração da Meta com histórico, vigência por mês e STATUS por componente.
-- ADITIVA: cria a tabela e grava a linha-base (o que valia antes), sem tocar em app_settings.

-- CreateTable
CREATE TABLE "meta_config_changes" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "previousValue" TEXT,
    "reason" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_config_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_config_changes_key_validFrom_idx" ON "meta_config_changes"("key", "validFrom");

-- Linha-base do STATUS dos 12 componentes, herdada do peso em vigor na subida:
-- peso > 0 (ou padrão > 0 sem gravação) = ATIVO; peso 0 = MONITORAMENTO.
-- É o que congela o estado de hoje: daí em diante só o Admin muda o status.
INSERT INTO "meta_config_changes" ("id", "key", "value", "validFrom", "previousValue", "reason", "userId", "userName", "createdAt")
SELECT
    md5(random()::text || clock_timestamp()::text || k.comp),
    k.comp || '_META_STATUS',
    CASE WHEN (CASE WHEN s.value ~ '^[0-9]+(\.[0-9]+)?$' THEN s.value::numeric ELSE k.def END) > 0 THEN 'ATIVO' ELSE 'MONITORAMENTO' END,
    '0000-01',
    NULL,
    'Linha-base da v1.180.0: situação herdada do peso em vigor na subida (peso > 0 = Ativo; 0 = Monitoramento).',
    NULL,
    'Sistema',
    CURRENT_TIMESTAMP
FROM (VALUES
    ('TASKS', 100, 'TASKS_META_WEIGHT'),
    ('TRAINING', 15, 'TRAINING_META_WEIGHT'),
    ('COMMUNICATION', 10, 'COMMUNICATION_META_WEIGHT'),
    ('PEOPLE_EVALUATION', 0, 'EVALUATION_META_WEIGHT'),
    ('WASTE', 0, 'WASTE_META_WEIGHT'),
    ('COMMANDS', 0, 'COMMANDS_META_WEIGHT'),
    ('CASH', 0, 'CASH_META_WEIGHT'),
    ('SCHEDULE', 0, 'SCHEDULE_META_WEIGHT'),
    ('CANCELLATIONS', 0, 'CANCELLATIONS_META_WEIGHT'),
    ('STOCK', 0, 'STOCK_META_WEIGHT'),
    ('INVENTORY', 0, 'INVENTORY_META_WEIGHT'),
    ('UTENSILS', 0, 'UTENSILS_META_WEIGHT')
) AS k(comp, def, wkey)
LEFT JOIN "app_settings" s ON s.key = k.wkey;

-- Decisão do Pedro (03/11/2026): módulos em implantação ficam FORA da bonificação
-- mesmo com dados — Treinamentos e Estoque passam a Monitoramento a partir do mês
-- corrente (em Brasília). Meses já encerrados seguem com a linha-base acima.
INSERT INTO "meta_config_changes" ("id", "key", "value", "validFrom", "previousValue", "reason", "userId", "userName", "createdAt")
SELECT
    md5(random()::text || clock_timestamp()::text || k.comp),
    k.comp || '_META_STATUS',
    'MONITORAMENTO',
    to_char((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM'),
    b.value,
    'Módulo em implantação: medido e mostrado em observação, fora da bonificação (decisão do Pedro, 03/11/2026).',
    NULL,
    'Sistema',
    CURRENT_TIMESTAMP + interval '1 second'
FROM (VALUES ('TRAINING'), ('STOCK')) AS k(comp)
LEFT JOIN "meta_config_changes" b ON b.key = k.comp || '_META_STATUS' AND b."validFrom" = '0000-01'
WHERE b.value IS DISTINCT FROM 'MONITORAMENTO';
