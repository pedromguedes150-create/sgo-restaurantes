-- CreateEnum
CREATE TYPE "ProbationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "probation_reviews" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "ProbationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "probation_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "probation_reviews_collaboratorId_key" ON "probation_reviews"("collaboratorId");

-- CreateIndex
CREATE INDEX "probation_reviews_unitId_idx" ON "probation_reviews"("unitId");

