-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('FREELANCER', 'OVERTIME', 'MISC');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');

-- CreateTable
CREATE TABLE "freelancers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultValue" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freelancers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freelancer_units" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "freelancer_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "misc_payment_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "approverRole" "Role" NOT NULL DEFAULT 'SUPERVISOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "misc_payment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_delegations" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "unitId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "approverRole" "Role" NOT NULL DEFAULT 'SUPERVISOR',
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "freelancerId" TEXT,
    "workDate" TIMESTAMP(3),
    "shift" TEXT,
    "hours" DOUBLE PRECISION,
    "collaboratorName" TEXT,
    "reason" TEXT,
    "miscTypeId" TEXT,
    "beneficiary" TEXT,
    "attachmentPath" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "freelancer_units_freelancerId_unitId_key" ON "freelancer_units"("freelancerId", "unitId");

-- CreateIndex
CREATE INDEX "approval_delegations_toUserId_idx" ON "approval_delegations"("toUserId");

-- CreateIndex
CREATE INDEX "approval_delegations_fromUserId_idx" ON "approval_delegations"("fromUserId");

-- CreateIndex
CREATE INDEX "payment_requests_unitId_status_idx" ON "payment_requests"("unitId", "status");

-- CreateIndex
CREATE INDEX "payment_requests_status_idx" ON "payment_requests"("status");

-- CreateIndex
CREATE INDEX "payment_requests_requestedById_idx" ON "payment_requests"("requestedById");

-- AddForeignKey
ALTER TABLE "freelancer_units" ADD CONSTRAINT "freelancer_units_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "freelancers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freelancer_units" ADD CONSTRAINT "freelancer_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "freelancers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_miscTypeId_fkey" FOREIGN KEY ("miscTypeId") REFERENCES "misc_payment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
