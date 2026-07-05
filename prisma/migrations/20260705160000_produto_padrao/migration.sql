-- CreateTable
CREATE TABLE "product_standards" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "photoPath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_standards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_standards_category_idx" ON "product_standards"("category");

