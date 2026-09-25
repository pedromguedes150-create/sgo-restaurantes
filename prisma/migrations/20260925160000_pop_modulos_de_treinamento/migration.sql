-- MÓDULOS DE TREINAMENTO (v1.124.0) — migração NÃO-DESTRUTIVA com backfill.
-- Cada POP existente vira um POP com UM módulo ("Treinamento"), copiando conteúdo,
-- público (funções/colaboradores/setores) e versão; todo training_record passa a
-- apontar para esse módulo, preservando conclusões, histórico e periodKey.
-- Colunas legadas do POP (content/isInitial/sector + tabelas pop_job_titles,
-- pop_collaborators, pop_sectors) FICAM: nada é apagado.

-- 1) Tabelas dos módulos
CREATE TABLE "pop_modules" (
    "id" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "allPublic" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pop_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pop_module_job_titles" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,

    CONSTRAINT "pop_module_job_titles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pop_module_collaborators" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,

    CONSTRAINT "pop_module_collaborators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pop_module_sectors" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "sectorName" TEXT NOT NULL,

    CONSTRAINT "pop_module_sectors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pop_modules_popId_idx" ON "pop_modules"("popId");
CREATE UNIQUE INDEX "pop_module_job_titles_moduleId_jobTitle_key" ON "pop_module_job_titles"("moduleId", "jobTitle");
CREATE UNIQUE INDEX "pop_module_collaborators_moduleId_collaboratorId_key" ON "pop_module_collaborators"("moduleId", "collaboratorId");
CREATE UNIQUE INDEX "pop_module_sectors_moduleId_sectorName_key" ON "pop_module_sectors"("moduleId", "sectorName");

ALTER TABLE "pop_modules" ADD CONSTRAINT "pop_modules_popId_fkey" FOREIGN KEY ("popId") REFERENCES "pops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pop_module_job_titles" ADD CONSTRAINT "pop_module_job_titles_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "pop_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pop_module_collaborators" ADD CONSTRAINT "pop_module_collaborators_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "pop_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pop_module_collaborators" ADD CONSTRAINT "pop_module_collaborators_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pop_module_sectors" ADD CONSTRAINT "pop_module_sectors_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "pop_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Backfill: um módulo por POP, com o MESMO número de versão do POP — assim o
--    periodKey "V{n}" dos registros únicos existentes continua vigente e a
--    migração não manda ninguém refazer treinamento.
INSERT INTO "pop_modules" ("id", "popId", "name", "order", "version", "allPublic", "active", "content", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'Treinamento', 0, p."version", p."isInitial", true, p."content", p."createdAt", CURRENT_TIMESTAMP
FROM "pops" p;

INSERT INTO "pop_module_job_titles" ("id", "moduleId", "jobTitle")
SELECT gen_random_uuid()::text, m."id", jt."jobTitle"
FROM "pop_job_titles" jt JOIN "pop_modules" m ON m."popId" = jt."popId";

INSERT INTO "pop_module_collaborators" ("id", "moduleId", "collaboratorId")
SELECT gen_random_uuid()::text, m."id", pc."collaboratorId"
FROM "pop_collaborators" pc JOIN "pop_modules" m ON m."popId" = pc."popId";

INSERT INTO "pop_module_sectors" ("id", "moduleId", "sectorName")
SELECT gen_random_uuid()::text, m."id", ps."sectorName"
FROM "pop_sectors" ps JOIN "pop_modules" m ON m."popId" = ps."popId";

-- 3) training_records: colunas do módulo (nulas primeiro, para o backfill)
ALTER TABLE "training_records"
  ADD COLUMN "moduleId" TEXT,
  ADD COLUMN "moduleName" TEXT,
  ADD COLUMN "moduleVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "training_records" tr
SET "moduleId" = m."id", "moduleName" = m."name", "moduleVersion" = tr."popVersion"
FROM "pop_modules" m
WHERE m."popId" = tr."popId";

ALTER TABLE "training_records"
  ALTER COLUMN "moduleId" SET NOT NULL,
  ALTER COLUMN "moduleName" SET NOT NULL;

-- 4) A unicidade passa a ser por MÓDULO
DROP INDEX "training_records_popId_collaboratorId_periodKey_key";
CREATE INDEX "training_records_popId_idx" ON "training_records"("popId");
CREATE UNIQUE INDEX "training_records_moduleId_collaboratorId_periodKey_key" ON "training_records"("moduleId", "collaboratorId", "periodKey");
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "pop_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
