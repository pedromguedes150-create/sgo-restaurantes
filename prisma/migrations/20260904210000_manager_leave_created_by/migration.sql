-- Escala de gerentes: quem LANCOU a folga/ferias.
-- Ate aqui so o proprio dono lancava, entao a coluna nao existia. Agora a
-- Supervisao/Admin lanca pelo gerente, e a grade precisa dizer por quem --
-- sem isso ninguem consegue conferir um lancamento que o gerente nao reconhece.
-- Nulo = lancamento antigo (era o proprio dono).
ALTER TABLE "manager_leaves" ADD COLUMN "createdById" TEXT;
