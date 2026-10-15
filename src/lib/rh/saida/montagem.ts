import { prisma } from '@/lib/db/prisma';
import {
  payloadAtestado, payloadDesligamento, payloadDemanda, type AcaoAtestado,
} from '@/lib/rh/saida/regras';
import type { RhOutboundType } from '@prisma/client';

/**
 * Monta o corpo de cada evento A PARTIR DO BANCO. É chamado ao enfileirar e,
 * de novo, no reenvio manual — assim um CPF ou CNPJ corrigido no cadastro
 * entra no próximo envio sem ninguém reescrever o evento.
 *
 * Devolve `{ erro }` quando falta dado que o contrato exige (CPF do colaborador,
 * CNPJ da unidade): o evento nasce como ERRO permanente, visível na tela do
 * Admin com o que falta, e sai de lá com "Reenviar" depois do conserto.
 */
export type Montagem =
  | { ok: true; payload: Record<string, unknown>; anexoPath: string | null; unitId: string | null }
  | { ok: false; erro: string; unitId: string | null };

const digits = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

export async function montarAtestado(certId: string, acao: AcaoAtestado): Promise<Montagem> {
  const c = await prisma.medicalCertificate.findUnique({
    where: { id: certId },
    select: { id: true, unitId: true, type: true, startDate: true, endDate: true, cid: true, observation: true, attachmentPath: true, collaborator: { select: { name: true, cpf: true } } },
  });
  if (!c) return { ok: false, erro: 'Atestado não encontrado no SGO', unitId: null };
  const cpf = digits(c.collaborator.cpf);
  if (cpf.length !== 11) return { ok: false, erro: `${c.collaborator.name} está sem CPF no cadastro (o RH exige CPF)`, unitId: c.unitId };
  return {
    ok: true,
    payload: payloadAtestado({ id: c.id, cpf, type: c.type, startDate: c.startDate, endDate: c.endDate, cid: c.cid, observation: c.observation }, acao),
    anexoPath: acao === 'cancelar' ? null : c.attachmentPath,
    unitId: c.unitId,
  };
}

export async function montarDesligamento(termId: string): Promise<Montagem> {
  const t = await prisma.termination.findUnique({
    where: { id: termId },
    select: {
      id: true, unitId: true, terminationKind: true, noticeMode: true, reasonCode: true, terminationDate: true, reason: true, letterPath: true, collaboratorName: true,
      collaborator: { select: { cpf: true } }, unit: { select: { cnpj: true, name: true } }, requestedBy: { select: { name: true, email: true } },
    },
  });
  if (!t) return { ok: false, erro: 'Pedido de desligamento não encontrado no SGO', unitId: null };
  if (!t.terminationKind || !t.reasonCode || !t.terminationDate) return { ok: false, erro: 'Pedido anterior à integração com o RH (sem tipo/motivo/data) — não é enviado', unitId: t.unitId };
  const cpf = digits(t.collaborator.cpf);
  if (cpf.length !== 11) return { ok: false, erro: `${t.collaboratorName} está sem CPF no cadastro (o RH exige CPF)`, unitId: t.unitId };
  const cnpj = digits(t.unit.cnpj);
  if (cnpj.length !== 14) return { ok: false, erro: `A unidade ${t.unit.name} está sem CNPJ em Configurações → Unidades (o RH exige o CNPJ)`, unitId: t.unitId };
  return {
    ok: true,
    payload: payloadDesligamento({
      terminationKind: t.terminationKind, noticeMode: t.noticeMode, reasonCode: t.reasonCode, terminationDate: t.terminationDate, reason: t.reason, letterPath: t.letterPath,
      cpf, unitCnpj: cnpj, solicitanteNome: t.requestedBy?.name ?? 'SGO', solicitanteEmail: t.requestedBy?.email ?? null,
    }),
    anexoPath: t.letterPath,
    unitId: t.unitId,
  };
}

export async function montarDemanda(demandaId: string): Promise<Montagem> {
  const d = await prisma.rhDemand.findUnique({
    where: { id: demandaId },
    select: { id: true, unitId: true, tipo: true, titulo: true, descricao: true, dataEvento: true, prioridade: true, createdByName: true, createdByEmail: true, collaborator: { select: { cpf: true } }, unit: { select: { cnpj: true } } },
  });
  if (!d) return { ok: false, erro: 'Demanda não encontrada no SGO', unitId: null };
  const cpf = digits(d.collaborator?.cpf);
  return {
    ok: true,
    payload: payloadDemanda({
      tipo: d.tipo, titulo: d.titulo, descricao: d.descricao, cpf: cpf.length === 11 ? cpf : null, unitCnpj: d.unit.cnpj,
      solicitanteNome: d.createdByName, solicitanteEmail: d.createdByEmail, dataEvento: d.dataEvento, prioridade: d.prioridade,
    }),
    anexoPath: null,
    unitId: d.unitId,
  };
}

/** Despacho por tipo — o reenvio manual usa isto para remontar do cadastro atual. */
export function montar(tipo: RhOutboundType, referenceId: string, acao: string): Promise<Montagem> {
  if (tipo === 'ATESTADO') return montarAtestado(referenceId, acao as AcaoAtestado);
  if (tipo === 'DESLIGAMENTO') return montarDesligamento(referenceId);
  return montarDemanda(referenceId);
}
