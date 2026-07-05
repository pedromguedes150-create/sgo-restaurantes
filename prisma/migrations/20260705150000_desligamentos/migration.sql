-- CreateEnum
CREATE TYPE "NoticeType" AS ENUM ('WORKED', 'INDEMNIFIED');

-- CreateEnum
CREATE TYPE "TerminationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "collaborators" ADD COLUMN     "hireDate" TEXT;

-- CreateTable
CREATE TABLE "terminations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "requestedById" TEXT,
    "noticeType" "NoticeType" NOT NULL,
    "noticeJustification" TEXT,
    "reason" TEXT NOT NULL,
    "collaboratorName" TEXT NOT NULL,
    "ageYears" INTEGER,
    "tenureText" TEXT,
    "certCount" INTEGER NOT NULL DEFAULT 0,
    "certDays" INTEGER NOT NULL DEFAULT 0,
    "status" "TerminationStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminations_unitId_status_idx" ON "terminations"("unitId", "status");

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

