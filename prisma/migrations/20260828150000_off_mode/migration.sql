-- CreateEnum
CREATE TYPE "OffMode" AS ENUM ('FIXED_WEEKLY', 'FIXED_PLUS_SUNDAY', 'CYCLE_ONLY');

-- AlterTable
ALTER TABLE "employee_schedules" ADD COLUMN     "offMode" "OffMode" NOT NULL DEFAULT 'FIXED_WEEKLY',
ADD COLUMN     "sundayEveryWeeks" INTEGER;

