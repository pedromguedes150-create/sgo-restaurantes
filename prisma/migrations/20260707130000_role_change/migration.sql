-- CreateEnum
CREATE TYPE "RoleChangeKind" AS ENUM ('FUNCTION', 'SECTOR');

-- CreateTable
CREATE TABLE "role_changes" (
    "id" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" "RoleChangeKind" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_changes_unitId_createdAt_idx" ON "role_changes"("unitId", "createdAt");

-- CreateIndex
CREATE INDEX "role_changes_collaboratorId_idx" ON "role_changes"("collaboratorId");
