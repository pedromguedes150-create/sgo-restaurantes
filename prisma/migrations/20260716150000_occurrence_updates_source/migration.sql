-- AlterTable (vínculo com o item do checklist que gerou a ocorrência)
ALTER TABLE "occurrences" ADD COLUMN "sourceTaskItemId" TEXT;
CREATE INDEX "occurrences_sourceTaskItemId_idx" ON "occurrences"("sourceTaskItemId");

-- CreateTable (fases/andamento da ocorrência)
CREATE TABLE "occurrence_updates" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrence_updates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "occurrence_updates_occurrenceId_createdAt_idx" ON "occurrence_updates"("occurrenceId", "createdAt");
ALTER TABLE "occurrence_updates" ADD CONSTRAINT "occurrence_updates_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
