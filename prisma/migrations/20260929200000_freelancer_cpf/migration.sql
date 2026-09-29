-- AlterTable: adiciona CPF ao freelancer (nullable p/ legado, unique p/ novos)
ALTER TABLE "freelancers" ADD COLUMN "cpf" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "freelancers_cpf_key" ON "freelancers"("cpf");
