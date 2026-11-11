-- v1.202.0 — Comandas: confirmação de recebimento físico da reposição. ADITIVA.
-- As reposições já existentes seguem valendo: são marcadas como recebidas na data de criação.

-- AlterTable
ALTER TABLE "command_replacements" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "receivedByName" TEXT,
ADD COLUMN     "receivedNote" TEXT;


UPDATE "command_replacements" SET "receivedAt" = "createdAt", "receivedById" = "createdById" WHERE "receivedAt" IS NULL;
