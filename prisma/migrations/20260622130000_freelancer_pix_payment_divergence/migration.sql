-- Freelancer: chave PIX (obrigatória no app; nullable no banco p/ registros legados)
ALTER TABLE "freelancers" ADD COLUMN "pixKey" TEXT;

-- PaymentRequest: snapshot do valor-padrão + flag de divergência
ALTER TABLE "payment_requests" ADD COLUMN "standardValue" DECIMAL(10,2);
ALTER TABLE "payment_requests" ADD COLUMN "divergent" BOOLEAN NOT NULL DEFAULT false;
