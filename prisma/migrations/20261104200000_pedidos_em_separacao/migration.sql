-- v1.188.0 — Pedidos por setor: "Recebido" virou "Em separação" (decisão do Pedro, 04/11/2026):
-- é o momento em que o separador pega a lista, e a partir dele o gerente não altera mais
-- aquele bloco. Só o NOME do valor muda — nenhuma linha é apagada ou reescrita.
ALTER TYPE "SectorOrderStatus" RENAME VALUE 'RECEBIDO' TO 'EM_SEPARACAO';
