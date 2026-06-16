-- CreateEnum
CREATE TYPE "ChecklistScope" AS ENUM ('UNIT', 'MANAGER');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('OK', 'EM_CORRECAO', 'A_CORRIGIR');

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'LATE';

-- DropIndex
DROP INDEX "task_instances_templateId_operationalDate_key";

-- AlterTable
ALTER TABLE "task_instances" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "draft" JSONB;

-- AlterTable
ALTER TABLE "task_templates" ADD COLUMN     "groupKey" TEXT,
ADD COLUMN     "scope" "ChecklistScope" NOT NULL DEFAULT 'UNIT',
ALTER COLUMN "limitTime" DROP NOT NULL,
ALTER COLUMN "limitTime" DROP DEFAULT;

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "section" TEXT,
    "text" TEXT NOT NULL,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_item_responses" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemText" TEXT NOT NULL,
    "status" "ItemStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_item_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_photos" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "itemId" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_items_templateId_idx" ON "checklist_items"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "task_item_responses_instanceId_itemId_key" ON "task_item_responses"("instanceId", "itemId");

-- CreateIndex
CREATE INDEX "task_photos_instanceId_idx" ON "task_photos"("instanceId");

-- CreateIndex
CREATE INDEX "task_instances_assignedToId_operationalDate_idx" ON "task_instances"("assignedToId", "operationalDate");

-- CreateIndex
CREATE UNIQUE INDEX "task_instances_templateId_operationalDate_assignedToId_key" ON "task_instances"("templateId", "operationalDate", "assignedToId");

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_item_responses" ADD CONSTRAINT "task_item_responses_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_photos" ADD CONSTRAINT "task_photos_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

