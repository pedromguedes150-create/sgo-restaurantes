-- Normaliza a hora do PLANEJADO CONGELADO para meio-dia UTC.
--
-- O resto do módulo de escala grava os dias com `dayUTC` = 12:00. O
-- congelamento da v1.68.0 gravou à meia-noite, e a grade lê o mês com limites
-- ao meio-dia: o dia 1 de todo mês congelado ficava FORA da consulta e nunca
-- era aplicado. A limpeza do mês tinha o espelho do problema no outro extremo,
-- deixando o último dia para trás.
--
-- Só existem linhas escritas pelo próprio "Preencher automaticamente" nesta
-- tabela, então normalizar não altera nenhuma decisão de ninguém: o dia
-- continua o mesmo, muda só a hora dentro dele.
UPDATE "schedule_plan_overrides"
   SET "date" = date_trunc('day', "date") + interval '12 hours'
 WHERE "date" <> date_trunc('day', "date") + interval '12 hours';
