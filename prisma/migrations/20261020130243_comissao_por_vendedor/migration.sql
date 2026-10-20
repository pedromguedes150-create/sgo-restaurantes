/*
  Warnings:

  - You are about to drop the `external_connections` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `external_request_logs` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CommissionLineKind" AS ENUM ('VENDEDOR', 'COZINHA', 'GRUPO', 'FREELANCER', 'NAO_CADASTRADO');

-- DropForeignKey
ALTER TABLE "external_connections" DROP CONSTRAINT "external_connections_createdById_fkey";

-- DropForeignKey
ALTER TABLE "external_request_logs" DROP CONSTRAINT "external_request_logs_connectionId_fkey";

-- DropTable
DROP TABLE "external_connections";

-- DropTable
DROP TABLE "external_request_logs";

-- DropEnum
DROP TYPE "ExternalAuthType";

-- CreateTable
CREATE TABLE "commission_imports" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "salesMonth" TEXT NOT NULL,
    "payMonth" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "unitDeclared" TEXT,
    "totalSales" DECIMAL(14,2) NOT NULL,
    "groupSales" DECIMAL(14,2) NOT NULL,
    "sellerPct" DECIMAL(6,3) NOT NULL,
    "kitchenPct" DECIMAL(6,3) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "replacedCount" INTEGER NOT NULL DEFAULT 0,
    "importedById" TEXT,
    "importedByName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_lines" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "kind" "CommissionLineKind" NOT NULL,
    "sellerCode" TEXT,
    "sellerName" TEXT NOT NULL,
    "sales" DECIMAL(14,2) NOT NULL,
    "pct" DECIMAL(6,3) NOT NULL,
    "calculated" DECIMAL(12,2) NOT NULL,
    "adjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustmentNote" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "collaboratorId" TEXT,
    "collaboratorName" TEXT,
    "payoutId" TEXT,

    CONSTRAINT "commission_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_seller_links" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sellerCode" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_seller_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_kitchen_job_titles" (
    "id" TEXT NOT NULL,
    "jobTitleKey" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_kitchen_job_titles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_imports_payMonth_idx" ON "commission_imports"("payMonth");

-- CreateIndex
CREATE UNIQUE INDEX "commission_imports_unitId_salesMonth_key" ON "commission_imports"("unitId", "salesMonth");

-- CreateIndex
CREATE INDEX "commission_lines_importId_idx" ON "commission_lines"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "commission_seller_links_unitId_sellerCode_key" ON "commission_seller_links"("unitId", "sellerCode");

-- CreateIndex
CREATE UNIQUE INDEX "commission_kitchen_job_titles_jobTitleKey_key" ON "commission_kitchen_job_titles"("jobTitleKey");

-- AddForeignKey
ALTER TABLE "commission_lines" ADD CONSTRAINT "commission_lines_importId_fkey" FOREIGN KEY ("importId") REFERENCES "commission_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
