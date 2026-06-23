-- AlterTable
ALTER TABLE "occurrence_types" ADD COLUMN     "isMaintenance" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "command_sequences" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Sequência',
    "rangeStart" INTEGER NOT NULL,
    "rangeEnd" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "command_sequences_unitId_idx" ON "command_sequences"("unitId");

-- AddForeignKey
ALTER TABLE "command_sequences" ADD CONSTRAINT "command_sequences_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data migration: copia a sequência única (legado) para command_sequences
INSERT INTO "command_sequences" ("id", "unitId", "name", "rangeStart", "rangeEnd", "active", "order", "createdAt")
SELECT gen_random_uuid()::text, "unitId", 'Sequência principal', "rangeStart", "rangeEnd", true, 0, now()
FROM "unit_command_configs";
