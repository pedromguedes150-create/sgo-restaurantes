-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('DAILY', 'LINK');

-- CreateEnum
CREATE TYPE "ChecklistFieldKind" AS ENUM ('VERIFICATION', 'SHORT_TEXT', 'TEXTAREA', 'NUMBER', 'TIME', 'DATE', 'SELECT', 'BOOLEAN', 'SECTION');

-- AlterTable
ALTER TABLE "task_templates" ADD COLUMN     "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "publicToken" TEXT,
ADD COLUMN     "linkEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "maxPerDay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notifyRole" TEXT;

-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN     "fieldKind" "ChecklistFieldKind" NOT NULL DEFAULT 'VERIFICATION',
ADD COLUMN     "options" JSONB,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "checklist_submissions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "collaboratorId" TEXT,
    "respondentName" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_templates_publicToken_key" ON "task_templates"("publicToken");

-- CreateIndex
CREATE INDEX "checklist_submissions_templateId_createdAt_idx" ON "checklist_submissions"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "checklist_submissions_unitId_createdAt_idx" ON "checklist_submissions"("unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "checklist_submissions" ADD CONSTRAINT "checklist_submissions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
