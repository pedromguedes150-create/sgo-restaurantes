-- CreateTable
CREATE TABLE "note_installments" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "note_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_installments_dueDate_idx" ON "note_installments"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "note_installments_noteId_seq_key" ON "note_installments"("noteId", "seq");

-- AddForeignKey
ALTER TABLE "note_installments" ADD CONSTRAINT "note_installments_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "received_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

