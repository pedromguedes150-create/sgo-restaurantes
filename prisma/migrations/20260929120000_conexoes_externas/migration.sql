-- CreateEnum
CREATE TYPE "ExternalAuthType" AS ENUM ('API_KEY_HEADER', 'BEARER');

-- CreateTable
CREATE TABLE "external_connections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "baseUrl" TEXT NOT NULL,
    "authType" "ExternalAuthType" NOT NULL DEFAULT 'API_KEY_HEADER',
    "authHeader" TEXT NOT NULL DEFAULT 'x-api-key',
    "credentialEnc" TEXT NOT NULL,
    "credentialLast4" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "testPath" TEXT NOT NULL DEFAULT '/',
    "lastUsedAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "lastOk" BOOLEAN,
    "lastResult" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_request_logs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "connectionName" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_request_logs_createdAt_idx" ON "external_request_logs"("createdAt");

-- CreateIndex
CREATE INDEX "external_request_logs_connectionId_createdAt_idx" ON "external_request_logs"("connectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "external_connections" ADD CONSTRAINT "external_connections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_request_logs" ADD CONSTRAINT "external_request_logs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "external_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

