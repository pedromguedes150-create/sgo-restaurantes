-- API Global do SGO (v1.129.0). ADITIVA: duas tabelas novas, nada existente é tocado.
-- CreateTable
CREATE TABLE "api_clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyPrefix" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_keyHash_key" ON "api_clients"("keyHash");

-- CreateIndex
CREATE INDEX "api_request_logs_createdAt_idx" ON "api_request_logs"("createdAt");

-- CreateIndex
CREATE INDEX "api_request_logs_clientId_createdAt_idx" ON "api_request_logs"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "api_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

