import { prisma } from '@/lib/db/prisma';
import { notifyAdmins } from '@/lib/notifications';
import type { Prisma } from '@prisma/client';

/**
 * Recepção de eventos do RH (envio automático RH→SGO, v1.16.0).
 * O RH chama nossos endpoints com Authorization: Bearer <RH_INBOUND_TOKEN>.
 * Tudo é registrado em RhInboundEvent (auditável na central de integrações):
 *  - inclusao: cria/reativa o colaborador (por CPF ou matrícula) e vincula à unidade.
 *  - desligamento: inativa o colaborador (por CPF).
 *  - periodo_aquisitivo / exclusao_periodo: registrados (processamento futuro,
 *    quando modelarmos períodos aquisitivos; férias hoje vêm via webhook próprio).
 * O sync por pull (colaboradoresDaUnidade) continua funcionando normalmente —
 * estes eventos só complementam.
 */

export function inboundAuthorized(req: Request): boolean {
  const token = process.env.RH_INBOUND_TOKEN ?? '';
  if (!token) return false;
  const h = req.headers.get('authorization') ?? '';
  return h === `Bearer ${token}` || req.headers.get('x-api-key') === token;
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

type InboundResult = { httpStatus: number; body: Record<string, unknown> };

async function log(event: string, payload: unknown, status: 'PROCESSED' | 'RECEIVED' | 'ERROR', message?: string) {
  await prisma.rhInboundEvent.create({
    data: { event, payload: (payload ?? {}) as Prisma.InputJsonValue, status, message: message ?? null },
  }).catch(() => {});
}

/** Inclusão (admissão): cria/reativa colaborador e vincula à unidade pelo nome (razão social). */
export async function handleInclusao(payload: Record<string, unknown>): Promise<InboundResult> {
  const cpf = digits(payload.cpf);
  const matricula = String(payload.matricula ?? '').trim();
  const nome = String(payload.nome ?? '').trim();
  const cargo = String(payload.cargo ?? '').trim() || null;
  const admissao = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.admissao ?? '')) ? String(payload.admissao) : null;
  const unidade = String(payload.unidade ?? payload.razao_social ?? '').trim();

  if (!nome || (cpf.length !== 11 && !matricula)) {
    await log('inclusao', payload, 'ERROR', 'Payload inválido: nome + (cpf de 11 dígitos ou matrícula) obrigatórios');
    return { httpStatus: 400, body: { error: 'Payload inválido: informe nome e cpf (11 dígitos) ou matricula' } };
  }

  const existing = await prisma.collaborator.findFirst({
    where: { OR: [...(cpf.length === 11 ? [{ cpf }] : []), ...(matricula ? [{ externalId: matricula }] : [])] },
  });

  let collaboratorId: string;
  let criado = false;
  if (existing) {
    await prisma.collaborator.update({
      where: { id: existing.id },
      data: { name: nome, active: true, jobTitle: cargo ?? existing.jobTitle, ...(cpf.length === 11 ? { cpf } : {}), ...(matricula ? { externalId: matricula } : {}), ...(admissao ? { hireDate: admissao } : {}), source: 'RH' },
    });
    collaboratorId = existing.id;
  } else {
    const c = await prisma.collaborator.create({
      data: { name: nome, jobTitle: cargo, active: true, source: 'RH', externalId: matricula || null, cpf: cpf.length === 11 ? cpf : null, hireDate: admissao },
    });
    collaboratorId = c.id;
    criado = true;
  }

  // vincula à unidade do SGO cujo rhUnitName = razão social enviada
  let unidadeVinculada = false;
  if (unidade) {
    const unit = await prisma.unit.findFirst({ where: { rhUnitName: unidade } });
    if (unit) {
      await prisma.collaboratorUnit.upsert({
        where: { collaboratorId_unitId: { collaboratorId, unitId: unit.id } },
        create: { collaboratorId, unitId: unit.id },
        update: {},
      });
      unidadeVinculada = true;
      // novos colaboradores → treinamentos iniciais
      const { reconcileTrainingForUnit } = await import('@/lib/training');
      await reconcileTrainingForUnit(unit.id).catch(() => {});
    }
  }

  await log('inclusao', payload, 'PROCESSED', `${nome}${criado ? ' (criado)' : ' (atualizado)'}${unidadeVinculada ? '' : ' — unidade não vinculada no SGO'}`);
  await notifyAdmins({
    title: 'RH: admissão recebida',
    body: `${nome}${cargo ? ` (${cargo})` : ''}${unidade ? ` — ${unidade}` : ''}${unidadeVinculada ? '' : ' · unidade não cadastrada no SGO (vincule em Configurações → Unidades)'}.`,
    link: '/configuracoes/integracoes', module: 'PEOPLE',
  }).catch(() => {});
  return { httpStatus: 200, body: { status: 'processado', colaboradorId: collaboratorId, criado } };
}

/** Desligamento: inativa por CPF (mesma semântica da fila do RH). */
export async function handleDesligamento(payload: Record<string, unknown>): Promise<InboundResult> {
  const cpf = digits(payload.cpf);
  if (cpf.length !== 11) {
    await log('desligamento', payload, 'ERROR', 'CPF inválido');
    return { httpStatus: 400, body: { error: 'CPF inválido' } };
  }
  const collab = await prisma.collaborator.findFirst({ where: { cpf } });
  if (!collab) {
    await log('desligamento', payload, 'ERROR', 'Colaborador com CPF informado não encontrado');
    return { httpStatus: 400, body: { error: 'Colaborador com CPF informado não encontrado' } };
  }
  const jaEstavaDesligado = !collab.active;
  if (!jaEstavaDesligado) await prisma.collaborator.update({ where: { id: collab.id }, data: { active: false } });
  await log('desligamento', payload, 'PROCESSED', `${collab.name}${jaEstavaDesligado ? ' (já estava desligado)' : ''}`);
  await notifyAdmins({
    title: 'RH: desligamento recebido',
    body: `${collab.name} foi desligado no RH e inativado no SGO.`,
    link: '/configuracoes/integracoes', module: 'PEOPLE',
  }).catch(() => {});
  return { httpStatus: 200, body: { status: 'processado', colaboradorId: collab.id, ...(jaEstavaDesligado ? { jaEstavaDesligado } : {}) } };
}

/** Período aquisitivo / exclusão: registra e reconhece (processamento futuro). */
export async function handlePeriodoAquisitivo(event: string, payload: Record<string, unknown>): Promise<InboundResult> {
  await log(event, payload, 'RECEIVED', 'Registrado — períodos aquisitivos ainda não são modelados no SGO');
  return { httpStatus: 200, body: { status: 'recebido' } };
}
