-- Higiene de banheiros: locais + solicitações públicas (QR)
CREATE TABLE "hygiene_locations" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hygiene_locations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hygiene_locations_unitId_active_idx" ON "hygiene_locations"("unitId", "active");
CREATE TABLE "hygiene_requests" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "locationId" TEXT,
    "locationName" TEXT NOT NULL,
    "issue" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hygiene_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hygiene_requests_unitId_createdAt_idx" ON "hygiene_requests"("unitId", "createdAt");
CREATE INDEX "hygiene_requests_unitId_status_idx" ON "hygiene_requests"("unitId", "status");
