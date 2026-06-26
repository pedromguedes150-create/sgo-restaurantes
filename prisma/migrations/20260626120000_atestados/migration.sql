-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('FULL_DAY', 'HOURS', 'COMPANION');

-- CreateTable
CREATE TABLE "medical_certificates" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL DEFAULT 'FULL_DAY',
    "issueDate" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 1,
    "hours" DECIMAL(5,2),
    "doctorName" TEXT,
    "doctorCrm" TEXT,
    "cid" TEXT,
    "attachmentPath" TEXT,
    "aiExtracted" JSONB,
    "observation" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medical_certificates_unitId_startDate_idx" ON "medical_certificates"("unitId", "startDate");

-- CreateIndex
CREATE INDEX "medical_certificates_collaboratorId_startDate_idx" ON "medical_certificates"("collaboratorId", "startDate");

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_collaboratorId_fkey" FOREIGN KEY ("collaboratorId") REFERENCES "collaborators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
