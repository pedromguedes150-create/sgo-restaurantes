-- Necessidade do setor por FAIXA DE HORARIO.
--
-- Substitui o Sector.minHeadcount, que era "minimo POR TURNO": com quatro
-- turnos cadastrados a unidade passava a "precisar" de quatro vezes o minimo,
-- sem ninguem ter pedido isso. E nao havia como dizer que a cozinha precisa de
-- 3 pessoas de manha e 1 de madrugada.
--
-- ADITIVO e sem susto: cada setor que tinha minimo > 0 ganha UMA faixa de
-- 00:00-24:00 com esse mesmo numero. No dia da subida nada muda de
-- comportamento — dividir a faixa e o que passa a ser possivel.

-- CreateTable
CREATE TABLE "sector_requirements" (
    "id" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "minPeople" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sector_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sector_requirements_sectorId_idx" ON "sector_requirements"("sectorId");

-- AddForeignKey
ALTER TABLE "sector_requirements" ADD CONSTRAINT "sector_requirements_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Converte o minimo antigo numa faixa de dia inteiro (inicio = fim = 00:00).
-- Setor com minimo 0 nao ganha faixa: 0 sempre significou "sem meta", e agora
-- significa "sem exigencia" — a mesma coisa, sem linha nenhuma.
INSERT INTO "sector_requirements" ("id", "sectorId", "startTime", "endTime", "minPeople", "order", "createdAt")
SELECT gen_random_uuid()::text, "id", '00:00', '00:00', "minHeadcount", 0, now()
  FROM "sectors"
 WHERE "minHeadcount" > 0;
