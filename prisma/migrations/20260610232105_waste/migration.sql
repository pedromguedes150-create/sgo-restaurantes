-- CreateTable
CREATE TABLE "waste_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_entries" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "observation" TEXT,
    "evidencePath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waste_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_entry_items" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "kg" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "waste_entry_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waste_categories_code_key" ON "waste_categories"("code");

-- CreateIndex
CREATE INDEX "waste_entries_unitId_operationalDate_idx" ON "waste_entries"("unitId", "operationalDate");

-- CreateIndex
CREATE UNIQUE INDEX "waste_entries_unitId_operationalDate_key" ON "waste_entries"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "waste_entry_items_categoryId_idx" ON "waste_entry_items"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "waste_entry_items_entryId_categoryId_key" ON "waste_entry_items"("entryId", "categoryId");

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entry_items" ADD CONSTRAINT "waste_entry_items_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "waste_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entry_items" ADD CONSTRAINT "waste_entry_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "waste_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
