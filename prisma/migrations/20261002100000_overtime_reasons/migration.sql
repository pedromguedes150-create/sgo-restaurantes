-- Hora extra (v1.142.0): catálogo de motivos + vínculo da solicitação ao motivo. Aditiva.
CREATE TABLE "overtime_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_reasons_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payment_requests" ADD COLUMN "overtimeReasonId" TEXT;

ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_overtimeReasonId_fkey" FOREIGN KEY ("overtimeReasonId") REFERENCES "overtime_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
