-- Ticket Médio (v1.140.0): a receita passa a ser o Σ "Vr. Total" da planilha
-- "Produtos Mais Vendidos". Aditiva: meses antigos ficam com netSales NULL e
-- continuam na conta anterior (venda − desconto).
ALTER TABLE "ticket_media_entries" ADD COLUMN "netSales" DECIMAL(14,2);
ALTER TABLE "ticket_media_entries" ADD COLUMN "productsFileName" TEXT;
