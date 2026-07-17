-- AlterEnum (Escala: status Atraso — trabalhou, chegou atrasado)
ALTER TYPE "DayStatus" ADD VALUE 'ATRASO';

-- AlterTable (Meu Perfil: CPF do usuário)
ALTER TABLE "users" ADD COLUMN "cpf" TEXT;
