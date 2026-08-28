-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workDays" INTEGER NOT NULL,
    "offDays" INTEGER NOT NULL,
    "startTime" TEXT,
    "breakTime" TEXT,
    "endTime" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_templates_name_key" ON "schedule_templates"("name");

