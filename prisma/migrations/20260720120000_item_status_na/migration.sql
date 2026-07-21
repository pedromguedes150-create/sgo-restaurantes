-- Adiciona status "Não se aplica" (neutro) aos itens de checklist
ALTER TYPE "ItemStatus" ADD VALUE IF NOT EXISTS 'NAO_SE_APLICA';
