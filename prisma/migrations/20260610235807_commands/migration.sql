-- CreateEnum
CREATE TYPE "DivergenceStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CLOSED');

-- CreateEnum
CREATE TYPE "DivergenceOutcome" AS ENUM ('RECOVERED', 'LOST');

-- CreateTable
CREATE TABLE "unit_command_configs" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "rangeStart" INTEGER NOT NULL,
    "rangeEnd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_command_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_counts" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "operationalDate" TEXT NOT NULL,
    "allPresent" BOOLEAN NOT NULL DEFAULT false,
    "absentCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_divergences" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "DivergenceStatus" NOT NULL DEFAULT 'OPEN',
    "outcome" "DivergenceOutcome",
    "observation" TEXT,
    "createdById" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "command_divergences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_replacements" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_replacements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_command_configs_unitId_key" ON "unit_command_configs"("unitId");

-- CreateIndex
CREATE INDEX "command_counts_unitId_operationalDate_idx" ON "command_counts"("unitId", "operationalDate");

-- CreateIndex
CREATE UNIQUE INDEX "command_counts_unitId_operationalDate_key" ON "command_counts"("unitId", "operationalDate");

-- CreateIndex
CREATE INDEX "command_divergences_unitId_status_idx" ON "command_divergences"("unitId", "status");

-- CreateIndex
CREATE INDEX "command_divergences_unitId_number_idx" ON "command_divergences"("unitId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "command_replacements_unitId_number_key" ON "command_replacements"("unitId", "number");

-- AddForeignKey
ALTER TABLE "unit_command_configs" ADD CONSTRAINT "unit_command_configs_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_counts" ADD CONSTRAINT "command_counts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_counts" ADD CONSTRAINT "command_counts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_divergences" ADD CONSTRAINT "command_divergences_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_divergences" ADD CONSTRAINT "command_divergences_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_divergences" ADD CONSTRAINT "command_divergences_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_replacements" ADD CONSTRAINT "command_replacements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_replacements" ADD CONSTRAINT "command_replacements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
