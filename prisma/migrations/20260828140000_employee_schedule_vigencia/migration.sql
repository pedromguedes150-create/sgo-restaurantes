-- Escala do colaborador com VIGÊNCIA (parte 2).
--
-- Escrita à mão porque tem BACKFILL: cada cadastro que existe hoje vira a
-- primeira vigência, começando na data-âncora dele. Gerar a coluna NOT NULL
-- direto exigiria um valor inventado para as linhas antigas.
--
-- Nada é apagado. A única remoção é o índice ÚNICO (colaborador, unidade), que
-- justamente impedia a segunda vigência de existir.

-- 1) Colunas novas, todas opcionais.
ALTER TABLE "employee_schedules"
  ADD COLUMN "templateId"   TEXT,
  ADD COLUMN "weeklyOffDay" INTEGER,
  ADD COLUMN "startTime"    TEXT,
  ADD COLUMN "breakTime"    TEXT,
  ADD COLUMN "endTime"      TEXT,
  ADD COLUMN "startDate"    TIMESTAMP(3),
  ADD COLUMN "endDate"      TIMESTAMP(3);

-- 2) BACKFILL: o cadastro atual passa a valer desde a própria data-âncora, que
--    é a data que o gerente informou como início do ciclo. Assim o Planejado
--    dos meses já vistos continua idêntico.
UPDATE "employee_schedules" SET "startDate" = "anchorDate" WHERE "startDate" IS NULL;

-- 3) Agora que toda linha tem vigência, a coluna passa a ser obrigatória.
ALTER TABLE "employee_schedules" ALTER COLUMN "startDate" SET NOT NULL;

-- 4) O único por (colaborador, unidade) sai: ele permitia UMA escala por
--    pessoa, que é exatamente o que impedia guardar o histórico.
DROP INDEX IF EXISTS "employee_schedules_collaboratorId_unitId_key";

CREATE INDEX "employee_schedules_collaboratorId_unitId_startDate_idx"
  ON "employee_schedules"("collaboratorId", "unitId", "startDate");
CREATE INDEX "employee_schedules_unitId_startDate_idx"
  ON "employee_schedules"("unitId", "startDate");

-- 5) Ligação com o tipo de escala cadastrado (Configurações → Tipos de escala).
ALTER TABLE "employee_schedules"
  ADD CONSTRAINT "employee_schedules_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "schedule_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
