-- Status novo do item de checklist: NAO_REALIZADO ("a atividade nao foi executada").
-- Aditivo: nenhum registro existente muda de valor.
--
-- Contexto: ate aqui o checklist tinha 4 status e "A corrigir" ABRIA UMA
-- OCORRENCIA SOZINHO, o que enchia a aba de Ocorrencias com rotina de checklist.
-- A separacao pedida precisa de um status que diga "nao foi feito" sem implicar
-- que alguem tenha de agir em outro setor.
ALTER TYPE "ItemStatus" ADD VALUE IF NOT EXISTS 'NAO_REALIZADO' BEFORE 'EM_CORRECAO';
