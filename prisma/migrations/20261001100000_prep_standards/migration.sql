-- Padronização de Preparo (v1.139.0): fichas de preparo dos produtos.
-- Aditiva: três tabelas e um enum, nada tocado no resto.
CREATE TYPE "PrepStandardStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "prep_standards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "imagePath" TEXT,
    "preparationMethod" TEXT,
    "generalNotes" TEXT,
    "status" "PrepStandardStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceFilePath" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prep_standards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prep_standard_items" (
    "id" TEXT NOT NULL,
    "standardId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "quantity" DECIMAL(10,3),
    "unit" TEXT,
    "weightGrams" DECIMAL(10,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "prep_standard_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prep_standard_changes" (
    "id" TEXT NOT NULL,
    "standardId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prep_standard_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prep_standards_code_idx" ON "prep_standards"("code");
CREATE INDEX "prep_standards_status_category_idx" ON "prep_standards"("status", "category");
CREATE INDEX "prep_standard_items_standardId_sortOrder_idx" ON "prep_standard_items"("standardId", "sortOrder");
CREATE INDEX "prep_standard_changes_standardId_createdAt_idx" ON "prep_standard_changes"("standardId", "createdAt");

ALTER TABLE "prep_standards" ADD CONSTRAINT "prep_standards_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prep_standards" ADD CONSTRAINT "prep_standards_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prep_standard_items" ADD CONSTRAINT "prep_standard_items_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "prep_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prep_standard_changes" ADD CONSTRAINT "prep_standard_changes_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "prep_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prep_standard_changes" ADD CONSTRAINT "prep_standard_changes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
