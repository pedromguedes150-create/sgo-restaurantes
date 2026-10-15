import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import {
  periodoDoFiltro, porColaboradorReembolso, resumirReembolsos,
  type FiltroReembolso, type LinhaReembolso, type ReembolsoPorColaborador, type ResumoReembolsos,
} from '@/lib/payments/reembolsos-calculo';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

export * from '@/lib/payments/reembolsos-calculo';

/**
 * Reembolsos (v1.169.0) — consulta para a tela e para a planilha. Só LÊ a
 * tabela de sempre (`payment_requests`, tipo MISC) no escopo do usuário; o
 * período corta pela DATA DA SOLICITAÇÃO, que todo registro tem (a data da
 * despesa só existe nos novos).
 */

export interface Reembolsos {
  filtro: FiltroReembolso;
  periodo: { de: string; ate: string; rotulo: string };
  unidades: { id: string; name: string }[];
  linhas: LinhaReembolso[];
  resumo: ResumoReembolsos;
  porColaborador: ReembolsoPorColaborador[];
}

const diaBR = (d: Date) => hojeNaOperacao(d);

export async function getReembolsos(user: SessionUser, filtro: FiltroReembolso, hoje = hojeNaOperacao()): Promise<Reembolsos> {
  const unidades = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const periodo = periodoDoFiltro(filtro, hoje);
  /* O id de unidade da URL fica em AND com o escopo: fora do alcance = vazio, nunca a rede. */
  const unitId = filtro.unitId && unidades.some((u) => u.id === filtro.unitId) ? filtro.unitId : filtro.unitId ? '__nenhuma__' : '';
  const where: Prisma.PaymentRequestWhereInput = {
    type: 'MISC',
    ...unitScopeWhere(user, 'unitId'),
    ...(unitId ? { unitId } : {}),
    ...(filtro.status !== 'TODOS' ? { status: filtro.status } : {}),
    createdAt: { gte: new Date(`${periodo.de}T00:00:00.000-03:00`), lt: new Date(`${periodo.ate}T23:59:59.999-03:00`) },
  };
  const rows = await prisma.paymentRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: {
      id: true, unitId: true, createdAt: true, workDate: true, amount: true, status: true, description: true, beneficiary: true,
      collaboratorId: true, collaboratorName: true, attachmentPath: true, rejectionReason: true, approvedAt: true, paidAt: true,
      unit: { select: { name: true } }, miscType: { select: { name: true } }, collaborator: { select: { cpf: true } },
      requestedBy: { select: { name: true } }, approvedBy: { select: { name: true } }, paidBy: { select: { name: true } },
    },
  });
  const linhas: LinhaReembolso[] = rows.map((r) => ({
    id: r.id,
    unitId: r.unitId,
    unidade: r.unit.name,
    dataDespesa: r.workDate ? r.workDate.toISOString().slice(0, 10) : null,
    dataSolicitacao: diaBR(r.createdAt),
    colaboradorId: r.collaboratorId,
    colaborador: r.collaboratorName ?? r.beneficiary ?? '—',
    cpf: r.collaborator?.cpf ?? null,
    motivo: r.miscType?.name ?? '—',
    descricao: r.description ?? '',
    valor: Number(r.amount),
    status: r.status,
    solicitadoPor: r.requestedBy?.name ?? '—',
    aprovadoPor: r.approvedBy?.name ?? null,
    aprovadoEm: r.approvedAt ? diaBR(r.approvedAt) : null,
    pagoPor: r.paidBy?.name ?? null,
    pagoEm: r.paidAt ? diaBR(r.paidAt) : null,
    comprovante: Boolean(r.attachmentPath),
    rejeicao: r.rejectionReason ?? null,
  }));
  return { filtro, periodo, unidades, linhas, resumo: resumirReembolsos(linhas), porColaborador: porColaboradorReembolso(linhas) };
}
