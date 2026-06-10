-- CreateEnum
CREATE TYPE "TaskModule" AS ENUM ('GENERAL', 'WASTE', 'COMMANDS', 'CANCELLATIONS', 'INVENTORY', 'OCCURRENCES');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'DONE', 'MISSED');

-- CreateTable
CREATE TABLE "task_templates" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "limitTime" TEXT NOT NULL DEFAULT '23:59',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "module" "TaskModule" NOT NULL DEFAULT 'GENERAL',
    "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
    "entersMeta" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_instances" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "evidencePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_templates_unitId_active_idx" ON "task_templates"("unitId", "active");

-- CreateIndex
CREATE INDEX "task_instances_unitId_operationalDate_idx" ON "task_instances"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "task_instances_status_idx" ON "task_instances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "task_instances_templateId_operationalDate_key" ON "task_instances"("templateId", "operationalDate");

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
