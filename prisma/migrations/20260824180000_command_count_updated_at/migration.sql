-- Quando a contagem do dia foi registrada pela ÚLTIMA vez.
-- Reenviar para corrigir é rotina, e sem esta coluna a tela não tinha como
-- provar que o reenvio funcionou: nada mudava e quem clicava concluía que o
-- botão não confirmava. Aditiva: linhas existentes ficam com o momento da
-- migração, o que é honesto — não se sabe quando foram atualizadas.
ALTER TABLE "command_counts" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
