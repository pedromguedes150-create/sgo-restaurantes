-- Avaliação por FUNÇÃO (v1.161.0) — migração ADITIVA: modelos de avaliação com versão,
-- vínculo cargo→modelo, e as colunas novas da avaliação. As 4 colunas antigas
-- passam a aceitar nulo (as avaliações antigas não são tocadas).

-- AlterTable
ALTER TABLE "collaborator_evaluations" ADD COLUMN     "classification" TEXT,
ADD COLUMN     "finalScore" DOUBLE PRECISION,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "modelId" TEXT,
ADD COLUMN     "modelName" TEXT,
ADD COLUMN     "modelVersionId" TEXT,
ADD COLUMN     "scores" JSONB,
ALTER COLUMN "punctuality" DROP NOT NULL,
ALTER COLUMN "performance" DROP NOT NULL,
ALTER COLUMN "teamwork" DROP NOT NULL,
ALTER COLUMN "presentation" DROP NOT NULL;

-- CreateTable
CREATE TABLE "evaluation_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerial" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_model_versions" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_model_job_titles" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "jobTitleKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_model_job_titles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_models_seedKey_key" ON "evaluation_models"("seedKey");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_model_versions_modelId_version_key" ON "evaluation_model_versions"("modelId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_model_job_titles_jobTitleKey_key" ON "evaluation_model_job_titles"("jobTitleKey");

-- CreateIndex
CREATE INDEX "evaluation_model_job_titles_modelId_idx" ON "evaluation_model_job_titles"("modelId");

-- CreateIndex
CREATE INDEX "collaborator_evaluations_modelId_yearMonth_idx" ON "collaborator_evaluations"("modelId", "yearMonth");

-- AddForeignKey
ALTER TABLE "collaborator_evaluations" ADD CONSTRAINT "collaborator_evaluations_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "evaluation_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborator_evaluations" ADD CONSTRAINT "collaborator_evaluations_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "evaluation_model_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_model_versions" ADD CONSTRAINT "evaluation_model_versions_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "evaluation_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_model_job_titles" ADD CONSTRAINT "evaluation_model_job_titles_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "evaluation_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

