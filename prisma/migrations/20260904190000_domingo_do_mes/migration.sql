-- AlterTable
ALTER TABLE "employee_schedules" ADD COLUMN     "sundayOfMonth" INTEGER;


-- Quem já estava em "folga fixa + domingo" ganha o PRIMEIRO domingo do mês.
-- O campo antigo dizia "a cada N semanas" e a regra real é "um domingo no mês";
-- a tradução mais próxima do que a grade mostrava é o primeiro da sequência.
-- Fica registrado que o número precisa ser reconferido no cadastro.
UPDATE "employee_schedules"
   SET "sundayOfMonth" = 1
 WHERE "offMode" = 'FIXED_PLUS_SUNDAY' AND "sundayOfMonth" IS NULL;
