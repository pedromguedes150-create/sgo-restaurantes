-- v1.189.0 — o separador pode ficar em mais de um setor (decisão do Pedro, 05/11/2026):
-- o principal segue em users.cdSectorId; os adicionais vivem aqui. ADITIVA.
CREATE TABLE "user_cd_sectors" (
    "userId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    CONSTRAINT "user_cd_sectors_pkey" PRIMARY KEY ("userId", "sectorId")
);
CREATE INDEX "user_cd_sectors_sectorId_idx" ON "user_cd_sectors"("sectorId");
ALTER TABLE "user_cd_sectors" ADD CONSTRAINT "user_cd_sectors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_cd_sectors" ADD CONSTRAINT "user_cd_sectors_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "cd_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
