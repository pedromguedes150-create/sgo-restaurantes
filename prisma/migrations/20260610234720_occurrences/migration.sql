-- CreateEnum
CREATE TYPE "OccurrenceGravity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

-- CreateTable
CREATE TABLE "occurrence_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "occurrence_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_categories" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "occurrence_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrences" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operationalDate" TEXT NOT NULL,
    "reportedById" TEXT,
    "typeId" TEXT,
    "categoryId" TEXT,
    "typeName" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "gravity" "OccurrenceGravity" NOT NULL,
    "customerName" TEXT,
    "description" TEXT NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'OPEN',
    "isRecurrence" BOOLEAN NOT NULL DEFAULT false,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closureJustification" TEXT,
    "correctiveAction" TEXT,
    "reviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_attachments" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrence_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "occurrence_types_code_key" ON "occurrence_types"("code");

-- CreateIndex
CREATE INDEX "occurrence_categories_typeId_idx" ON "occurrence_categories"("typeId");

-- CreateIndex
CREATE INDEX "occurrences_unitId_status_idx" ON "occurrences"("unitId", "status");

-- CreateIndex
CREATE INDEX "occurrences_unitId_operationalDate_idx" ON "occurrences"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "occurrences_gravity_idx" ON "occurrences"("gravity");

-- CreateIndex
CREATE UNIQUE INDEX "occurrences_unitId_number_key" ON "occurrences"("unitId", "number");

-- CreateIndex
CREATE INDEX "occurrence_attachments_occurrenceId_idx" ON "occurrence_attachments"("occurrenceId");

-- AddForeignKey
ALTER TABLE "occurrence_categories" ADD CONSTRAINT "occurrence_categories_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "occurrence_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "occurrence_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "occurrence_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_attachments" ADD CONSTRAINT "occurrence_attachments_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
