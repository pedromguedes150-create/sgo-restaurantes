-- v1.195.0 — Comunicados: os PERFIS que recebem nas unidades escolhidas (aditiva).
-- Até aqui as unidades alcançavam só o perfil Gerente; o padrão preserva exatamente isso
-- para todo comunicado já gravado.
ALTER TABLE "communications" ADD COLUMN "targetRoles" "Role"[] NOT NULL DEFAULT ARRAY['MANAGER']::"Role"[];
