-- CreateTable
CREATE TABLE "commission_link_dismissals" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sellerCode" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "collaboratorId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_link_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_link_dismissals_unitId_sellerCode_collaboratorId_key" ON "commission_link_dismissals"("unitId", "sellerCode", "collaboratorId");
