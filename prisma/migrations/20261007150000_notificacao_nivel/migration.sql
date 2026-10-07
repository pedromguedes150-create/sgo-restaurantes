-- Nível do aviso ao vivo (v1.158.0). ADITIVA: coluna nova com padrão NORMAL;
-- os avisos críticos já gravados passam a CRITICO (mesmo significado do campo critical).
CREATE TYPE "NotificationLevel" AS ENUM ('NORMAL', 'IMPORTANTE', 'CRITICO');
ALTER TABLE "notifications" ADD COLUMN "level" "NotificationLevel" NOT NULL DEFAULT 'NORMAL';
UPDATE "notifications" SET "level" = 'CRITICO' WHERE "critical" = true;
