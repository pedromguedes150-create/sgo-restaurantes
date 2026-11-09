-- v1.197.0 — Central de Atestados e Afins, etapa B: a decisão do RH volta pela API,
-- o gerente corrige e reenvia, e cada documento guarda a linha do tempo (decisões,
-- correções, versões do anexo). ADITIVA.

ALTER TABLE "medical_certificates" ADD COLUMN "statusMotivo" TEXT;

CREATE TYPE "CertificateEventKind" AS ENUM ('SITUACAO', 'CORRECAO', 'ANEXO');

CREATE TABLE "medical_certificate_events" (
  "id" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "kind" "CertificateEventKind" NOT NULL,
  "fromStatus" "DocumentStatus",
  "toStatus" "DocumentStatus",
  "motivo" TEXT,
  "note" TEXT,
  "attachmentPath" TEXT,
  "origem" TEXT NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "medical_certificate_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "medical_certificate_events_certificateId_createdAt_idx" ON "medical_certificate_events"("certificateId", "createdAt");

ALTER TABLE "medical_certificate_events"
  ADD CONSTRAINT "medical_certificate_events_certificateId_fkey"
  FOREIGN KEY ("certificateId") REFERENCES "medical_certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
