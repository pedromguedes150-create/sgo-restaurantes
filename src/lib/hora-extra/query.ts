import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { escopo, noPeriodo, dataDe } from '@/lib/payments/consolidado';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import type { SessionUser } from '@/lib/auth/session';
import {
  FILTRO_OUTRO, MOTIVO_OUTRO, buscar, evolucaoMensal, mesesDoPeriodo, porMotivo, porStatus, resolverPeriodoHE, resumirHE,
  type FatiaDeMotivo, type FatiaDeStatus, type FiltroHE, type HoraExtra, type MesDaEvolucao, type Periodo, type ResumoHE,
} from '@/lib/hora-extra/calculo';

export * from '@/lib/hora-extra/calculo';

/**
 * HORA EXTRA — leitura no servidor (v1.142.0).
 *
 * Camada de CONSULTA sobre `payment_requests` (tipo OVERTIME). Nada grava.
 * Escopo = `escopo()` das consolidações (Financeiro vê a rede; os demais, as
 * suas unidades); data = dia do serviço → data efetiva → criação (`noPeriodo`).
 *
 * Matrícula e CPF saem do CADASTRO (`Collaborator.externalId`/`cpf`, que o RH
 * sincroniza), nunca copiados para a solicitação — correção no RH aparece no
 * próximo arquivo. HE antiga sem vínculo fica sem os dois, e a tela aponta.
 */

export interface PainelHE {
  filtro: FiltroHE;
  periodo: Periodo;
  hes: HoraExtra[];
  resumo: ResumoHE;
  motivos: FatiaDeMotivo[];
  status: FatiaDeStatus[];
  evolucao: MesDaEvolucao[];
  unidades: { id: string; name: string }[];
}

export async function unidadesDaHoraExtra(user: SessionUser) {
  const todas = user.seesAllUnits || user.role === 'FINANCE';
  return prisma.unit.findMany({
    where: { active: true, ...(todas ? {} : { id: { in: user.unitIds } }) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

type Linha = Prisma.PaymentRequestGetPayload<{ select: typeof SELECT }>;
const SELECT = {
  id: true, unitId: true, status: true, amount: true, hours: true, hourlyRate: true, transportValue: true,
  workDate: true, entryDate: true, createdAt: true, workStartTime: true, workEndTime: true,
  collaboratorId: true, collaboratorName: true, reason: true, overtimeReasonId: true, rejectionReason: true,
  unit: { select: { name: true } },
  collaborator: { select: { name: true, externalId: true, cpf: true } },
  overtimeReason: { select: { name: true } },
  requestedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
} satisfies Prisma.PaymentRequestSelect;

export const paraHoraExtra = (r: Linha): HoraExtra => ({
  id: r.id,
  unitId: r.unitId,
  unidade: r.unit.name,
  collaboratorId: r.collaboratorId,
  colaborador: r.collaborator?.name ?? r.collaboratorName ?? 'Colaborador',
  matricula: r.collaborator?.externalId ?? null,
  cpf: r.collaborator?.cpf ?? null,
  dia: dataDe(r),
  inicio: r.workStartTime,
  fim: r.workEndTime,
  horas: r.hours,
  valorHora: r.hourlyRate != null ? Number(r.hourlyRate) : null,
  vt: Number(r.transportValue ?? 0),
  valor: Number(r.amount),
  motivoId: r.overtimeReasonId,
  motivo: r.overtimeReason?.name ?? MOTIVO_OUTRO,
  detalhe: r.reason,
  status: r.status,
  solicitante: r.requestedBy?.name ?? null,
  aprovador: r.approvedBy?.name ?? null,
  motivoReprovacao: r.rejectionReason,
  criadoEm: r.createdAt.toISOString(),
});

export async function getHorasExtras(user: SessionUser, filtro: FiltroHE, hoje = hojeNaOperacao()): Promise<PainelHE> {
  const periodo = resolverPeriodoHE(filtro, hoje);
  const unidades = await unidadesDaHoraExtra(user);
  /* Unidade fora do alcance é IGNORADA, não obedecida: o recorte de verdade é o escopo no where. */
  const unitId = filtro.unitId && unidades.some((u) => u.id === filtro.unitId) ? filtro.unitId : undefined;

  const rows = await prisma.paymentRequest.findMany({
    where: {
      ...escopo(user),
      type: 'OVERTIME',
      ...(unitId ? { unitId } : {}),
      ...(filtro.status !== 'TODOS' ? { status: filtro.status } : {}),
      ...(filtro.motivo === FILTRO_OUTRO ? { overtimeReasonId: null } : filtro.motivo ? { overtimeReasonId: filtro.motivo } : {}),
      ...noPeriodo(periodo.de, periodo.ate),
    },
    select: SELECT,
    orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
  });

  const hes = buscar(rows.map(paraHoraExtra), filtro.q);
  return {
    filtro: { ...filtro, unitId },
    periodo,
    hes,
    resumo: resumirHE(hes),
    motivos: porMotivo(hes),
    status: porStatus(hes),
    evolucao: evolucaoMensal(hes, mesesDoPeriodo(periodo)),
    unidades,
  };
}
