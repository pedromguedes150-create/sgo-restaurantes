-- CreateTable
CREATE TABLE "collaborator_observations" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaborator_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborator_evaluations" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "punctuality" INTEGER NOT NULL,
    "performance" INTEGER NOT NULL,
    "teamwork" INTEGER NOT NULL,
    "presentation" INTEGER NOT NULL,
    "comments" TEXT,
    "evaluatorId" TEXT NOT NULL,
    "evaluatorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaborator_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collaborator_observations_collaboratorId_idx" ON "collaborator_observations"("collaboratorId");

-- CreateIndex
CREATE INDEX "collaborator_observations_unitId_idx" ON "collaborator_observations"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "collaborator_evaluations_collaboratorId_yearMonth_key" ON "collaborator_evaluations"("collaboratorId", "yearMonth");

-- CreateIndex
CREATE INDEX "collaborator_evaluations_unitId_yearMonth_idx" ON "collaborator_evaluations"("unitId", "yearMonth");
