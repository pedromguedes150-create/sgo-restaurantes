-- CreateEnum
CREATE TYPE "ManagerLeaveKind" AS ENUM ('FOLGA', 'FERIAS');

-- CreateTable
CREATE TABLE "manager_tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_leaves" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ManagerLeaveKind" NOT NULL DEFAULT 'FOLGA',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_tasks_userId_idx" ON "manager_tasks"("userId");

-- CreateIndex
CREATE INDEX "manager_notes_userId_idx" ON "manager_notes"("userId");

-- CreateIndex
CREATE INDEX "manager_leaves_userId_idx" ON "manager_leaves"("userId");

-- AddForeignKey
ALTER TABLE "manager_tasks" ADD CONSTRAINT "manager_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_notes" ADD CONSTRAINT "manager_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_leaves" ADD CONSTRAINT "manager_leaves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

