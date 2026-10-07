import { prisma } from '@/lib/db/prisma';
import { escopo, noPeriodo, dataDe, getConsolidadoFreelancers } from '@/lib/payments/consolidado';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import type { SessionUser } from '@/lib/auth/session';
import {
  chaveDaPessoa, filtrarLancamentos, ordenar, pessoasDoPeriodo, porColaborador, porSegundaDePagamento, porUnidade, resolverPeriodo, resumir, segundaDoPagamento, totaisDaRecorrencia,
  type Consolidacao, type FiltroConsolidacao, type Lancamento, type Recorrencia,
} from '@/lib/payments/consolidacao-calculo';

export * from '@/lib/payments/consolidacao-calculo';

/**
 * CONSOLIDAÇÃO DE PAGAMENTOS — leitura no servidor (v1.126.0).
 *
 * Tudo sai de `payment_requests`, com as regras que já existem:
 *  - escopo: `escopo()` do consolidado de freelancers (Financeiro vê a rede,
 *    os demais só as suas unidades) — no `where`, nunca no cliente;
 *  - data: o DIA DO SERVIÇO (`workDate`), senão a data efetiva, senão a
 *    criação — a mesma cascata `noPeriodo`/`dataDe` do consolidado.
 *
 * Nada aqui grava: exportar ou imprimir não marca pago, não muda status.
 */

/** Unidades que o usuário pode filtrar — o mesmo alcance do `escopo()`. */
export async function unidadesDaConsolidacao(user: SessionUser) {
  const todas = user.seesAllUnits || user.role === 'FINANCE';
  return prisma.unit.findMany({
    where: { active: true, ...(todas ? {} : { id: { in: user.unitIds } }) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

const diaEmBrasilia = (d: Date) => hojeNaOperacao(d);

export async function getConsolidacaoPagamentos(user: SessionUser, filtro: FiltroConsolidacao, hoje = hojeNaOperacao()): Promise<Consolidacao> {
  const periodo = resolverPeriodo(filtro, hoje);
  const unidades = await unidadesDaConsolidacao(user);
  /* Unidade fora do alcance é IGNORADA, não obedecida: o recorte de verdade é
     o `escopo()` no where; aqui só se decide o que o seletor pediu. */
  const unitId = filtro.unitId && unidades.some((u) => u.id === filtro.unitId) ? filtro.unitId : undefined;

  const rows = await prisma.paymentRequest.findMany({
    where: {
      ...escopo(user),
      type: filtro.tipo === 'TODOS' ? { in: ['FREELANCER', 'OVERTIME'] } : filtro.tipo,
      ...(unitId ? { unitId } : {}),
      ...noPeriodo(periodo.de, periodo.ate),
    },
    select: {
      id: true, type: true, status: true, amount: true, transportValue: true, hours: true,
      workDate: true, entryDate: true, createdAt: true, unitId: true, paidAt: true,
      freelancerId: true, collaboratorId: true, collaboratorName: true,
      reason: true, description: true, coverageSector: true,
      unit: { select: { name: true } },
      freelancer: { select: { name: true, cpf: true, pixKey: true } },
      /* CPF do colaborador do RH para a hora extra — lido do cadastro, não copiado. */
      collaborator: { select: { cpf: true } },
      requestedBy: { select: { name: true } },
    },
  });

  const todos: Lancamento[] = rows.map((r) => {
    const tipo = r.type === 'FREELANCER' ? 'FREELANCER' as const : 'OVERTIME' as const;
    const pessoa = tipo === 'FREELANCER' ? (r.freelancer?.name ?? 'Freelancer') : (r.collaboratorName ?? 'Colaborador');
    return {
      id: r.id,
      data: dataDe(r),
      unitId: r.unitId,
      unidade: r.unit.name,
      tipo,
      pessoaChave: chaveDaPessoa({ tipo, freelancerId: r.freelancerId, collaboratorId: r.collaboratorId, nome: pessoa }),
      pessoa,
      horas: r.hours ?? null,
      vt: r.transportValue != null ? Number(r.transportValue) : 0,
      valor: Number(r.amount),
      status: r.status,
      /* Motivo: o da Hora Extra; no freelancer, a cobertura de setor ou a
         observação — é o que responde "por que houve este pagamento". */
      motivo: tipo === 'OVERTIME' ? (r.reason ?? null) : (r.coverageSector ? `Cobertura: ${r.coverageSector}` : (r.description ?? null)),
      solicitadoPor: r.requestedBy?.name ?? null,
      dataSolicitacao: diaEmBrasilia(r.createdAt),
      semVinculoRh: tipo === 'OVERTIME' && !r.collaboratorId,
      cpf: tipo === 'FREELANCER' ? (r.freelancer?.cpf ?? null) : (r.collaborator?.cpf ?? null),
      pixKey: tipo === 'FREELANCER' ? (r.freelancer?.pixKey ?? null) : null,
      pagarEm: tipo === 'FREELANCER' ? segundaDoPagamento(dataDe(r)) : null,
      pagoEm: r.paidAt ? diaEmBrasilia(r.paidAt) : null,
    };
  });

  const doStatus = filtrarLancamentos(todos, { status: filtro.status });
  /* Em ordem de data do serviço: é a ordem em que o Excel e o PDF saem. */
  const lancamentos = ordenar(filtrarLancamentos(doStatus, { status: 'TODOS', pessoa: filtro.pessoa }), 'data', 'asc');

  return {
    periodo,
    unidades,
    lancamentos,
    pessoas: pessoasDoPeriodo(doStatus),
    resumo: resumir(lancamentos, filtro.status),
    porUnidade: porUnidade(lancamentos, filtro.status),
    porColaborador: porColaborador(lancamentos, filtro.status),
    porSegunda: porSegundaDePagamento(lancamentos, filtro.status, hoje),
  };
}

/**
 * RECORRÊNCIA DE FREELANCERS na consolidação (v1.127.0).
 *
 * NÃO é uma segunda conta: pergunta ao consolidado de freelancers
 * (`getConsolidadoFreelancers`), que conta semanas inteiras segunda→domingo
 * com o limite de `getFreelancerWeekLimit()` — a MESMA regra que avisa a
 * supervisão no lançamento. Aqui só se acrescentam os totais e o recorte do
 * período/unidade que a tela escolheu.
 */
export async function getRecorrenciaFreelancers(user: SessionUser, filtro: FiltroConsolidacao, hoje = hojeNaOperacao()): Promise<Recorrencia> {
  const periodo = resolverPeriodo(filtro, hoje);
  const unidades = await unidadesDaConsolidacao(user);
  const unitId = filtro.unitId && unidades.some((u) => u.id === filtro.unitId) ? filtro.unitId : undefined;
  const c = await getConsolidadoFreelancers(user, {
    periodo: 'personalizado', de: periodo.de, ate: periodo.ate, unitId,
    tipo: 'FREELANCER', status: 'TODOS', recorrencia: 'todos',
  });
  const linhas = c.recorrentesNaSemana.map((g) => ({ ...g }));
  return { periodo, limiteSemanal: c.limiteSemanal, linhas, totais: totaisDaRecorrencia(linhas) };
}
