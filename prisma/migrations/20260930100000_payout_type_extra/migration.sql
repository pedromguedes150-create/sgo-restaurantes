-- Pagamento Extra (v1.135.0): a competência das horas extras aprovadas.
-- Nenhuma linha em collaborator_payouts é criada para este tipo — o quadro é
-- derivado de payment_requests; o valor só entra em payout_deliveries e
-- payout_closures (entrega por unidade e fechamento da competência).
ALTER TYPE "PayoutType" ADD VALUE IF NOT EXISTS 'EXTRA';
