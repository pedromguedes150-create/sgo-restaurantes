import type { getQuadroDaCompetencia } from '@/lib/people/payouts-competencia';
import type { QuadroUI } from '@/components/people/payouts-competencia-client';

/**
 * Do quadro do servidor para o que a tela recebe — compartilhado pelas telas
 * de Hora extra (aba Fechamento) e Mobilidade (v1.142.0), que até então era
 * uma função dentro da página única.
 */
export function paraTelaDoQuadro(q: Awaited<ReturnType<typeof getQuadroDaCompetencia>>): QuadroUI {
  return {
    competencia: q.competencia,
    totalGeral: q.totalGeral,
    totalLancamentos: q.totalLancamentos,
    fechada: q.fechada,
    fechadaPor: q.fechadaPor,
    unidadesSemLancamento: q.unidadesSemLancamento,
    grupos: q.grupos.map((g) => ({
      unitId: g.unitId, unidade: g.unidade, total: g.total, entregaEm: g.entregaEm,
      lancamentos: g.lancamentos.map((l) => ({
        id: l.id, collaboratorId: l.collaboratorId, colaborador: l.colaborador,
        cpf: l.cpf, valor: l.valor, observacao: l.observacao, lancadoPor: l.lancadoPor,
        horas: l.horas, status: l.status,
        horasExtras: l.horasExtras?.map((h) => ({
          id: h.id, dia: h.dia, inicio: h.inicio, fim: h.fim, horas: h.horas, valorHora: h.valorHora,
          vt: h.vt, valor: h.valor, status: h.status, aprovadoPor: h.aprovadoPor,
        })),
      })),
    })),
    extra: q.extra ? {
      mesTrabalhado: q.extra.mesTrabalhado,
      rotuloMesTrabalhado: q.extra.rotuloMesTrabalhado,
      colaboradores: q.extra.colaboradores,
      pendentes: q.extra.pendentes,
      aposFechamento: {
        qtd: q.extra.aposFechamento.qtd,
        valor: q.extra.aposFechamento.valor,
        linhas: q.extra.aposFechamento.linhas.map((h) => ({
          id: h.id, dia: h.dia, inicio: h.inicio, fim: h.fim, horas: h.horas, valorHora: h.valorHora,
          vt: h.vt, valor: h.valor, status: h.status, aprovadoPor: h.aprovadoPor, colaborador: h.colaborador,
        })),
      },
    } : undefined,
  };
}

/**
 * Os últimos meses E o próximo: a competência da Hora extra é o mês SEGUINTE
 * ao trabalho, então as horas extras de hoje já têm competência — e ela
 * precisa aparecer no seletor.
 */
export function competencias(n: number, hoje = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(hoje);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  for (let i = 0; i < n + 1; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
