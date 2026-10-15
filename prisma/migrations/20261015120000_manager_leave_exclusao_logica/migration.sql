-- Escala de gerentes (v1.170.0): apagar folga/férias passa a ser exclusão LÓGICA
-- com motivo obrigatório. Migração ADITIVA: nenhuma linha é tocada.
ALTER TABLE "manager_leaves" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "manager_leaves" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "manager_leaves" ADD COLUMN "deleteReason" TEXT;
