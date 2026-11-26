import type { Consolidado, LinhaDoConsolidado, RecorrenteNaSemana } from '@/lib/payments/consolidado-tipos';
import type { PaymentStatus } from '@prisma/client';

/**
 * LEITURA EXECUTIVA do consolidado de freelancers (v1.224.0) — PURA.
 *
 * Não é segunda conta: tudo sai do `Consolidado` que a tela já mostra (as
 * mesmas linhas, a mesma recorrência, rejeitadas fora do valor). Aqui só se
 * responde o que a diretoria pergunta antes de olhar tabela: onde o gasto se
 * concentra, quanto dele é recorrente, quanto já foi pago e em que dia da
 * semana a rede mais chama freelancer.
 */

export interface FatiaExecutiva { rotulo: string; qtd: number; valor: number; pct: number }

export interface AnaliseDoConsolidado {
  /** Valor ÷ solicitações (rejeitadas fora). Nulo sem solicitação. */
  ticketMedio: number | null;
  /** Valor ÷ freelancers únicos. Nulo sem freelancer. */
  valorPorFreelancer: number | null;
  porStatus: FatiaExecutiva[];
  /** Unidades pela fatia do valor (maior primeiro). */
  porUnidade: FatiaExecutiva[];
  /** Os cinco freelancers de maior valor e quanto do total eles somam. */
  topFreelancers: (FatiaExecutiva & { recorrente: boolean })[];
  top5Pct: number;
  /** Quanto do valor do período é de quem passou do limite semanal. */
  recorrencia: { pessoas: number; solicitacoes: number; valor: number; pctDoValor: number };
  /** Segunda → domingo, pelo dia do serviço. */
  porDiaDaSemana: FatiaExecutiva[];
  porSetor: FatiaExecutiva[];
  /** Frases prontas, na ordem em que importam. */
  leituras: string[];
}

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const STATUS_ORDEM: PaymentStatus[] = ['PENDING', 'APPROVED', 'PAID', 'REJECTED'];
const STATUS_ROTULO: Record<PaymentStatus, string> = { PENDING: 'Pendente de aprovação', APPROVED: 'Aprovado — a pagar', PAID: 'Pago', REJECTED: 'Rejeitado (fora do valor)' };

const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);
const p1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** 0 = segunda … 6 = domingo, a partir de AAAA-MM-DD (sem fuso). */
export function diaDaSemanaSegDom(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

function agrupar(linhas: LinhaDoConsolidado[], chave: (l: LinhaDoConsolidado) => string, total: number): FatiaExecutiva[] {
  const m = new Map<string, { qtd: number; valor: number }>();
  for (const l of linhas) {
    const k = chave(l);
    const g = m.get(k) ?? { qtd: 0, valor: 0 };
    g.qtd++;
    g.valor += l.valor;
    m.set(k, g);
  }
  return [...m.entries()].map(([rotulo, g]) => ({ rotulo, ...g, pct: pct(g.valor, total) }))
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

export function analisarConsolidado(c: Consolidado): AnaliseDoConsolidado {
  const validas = c.linhas.filter((l) => l.status !== 'REJECTED');
  const total = validas.reduce((s, l) => s + l.valor, 0);
  const r = c.resumo;

  const porStatus: FatiaExecutiva[] = STATUS_ORDEM.map((st) => {
    const xs = c.linhas.filter((l) => l.status === st);
    const valor = xs.reduce((s, l) => s + l.valor, 0);
    return { rotulo: STATUS_ROTULO[st], qtd: xs.length, valor, pct: st === 'REJECTED' ? 0 : pct(valor, total) };
  }).filter((f) => f.qtd > 0);

  const porUnidade: FatiaExecutiva[] = c.porUnidade.map((u) => ({ rotulo: u.nome, qtd: u.solicitacoes, valor: u.valor, pct: u.pctRede }));

  const ordenados = [...c.freelancers].sort((a, b) => b.valor - a.valor || b.solicitacoes - a.solicitacoes);
  const topFreelancers = ordenados.slice(0, 5).map((f) => ({ rotulo: f.nome, qtd: f.solicitacoes - f.rejeitadas, valor: f.valor, pct: pct(f.valor, total), recorrente: f.recorrente }));
  const top5Pct = pct(topFreelancers.reduce((s, f) => s + f.valor, 0), total);

  const recs = c.freelancers.filter((f) => f.recorrente);
  const recorrencia = {
    pessoas: recs.length,
    solicitacoes: recs.reduce((n, f) => n + f.solicitacoes - f.rejeitadas, 0),
    valor: recs.reduce((s, f) => s + f.valor, 0),
    pctDoValor: pct(recs.reduce((s, f) => s + f.valor, 0), total),
  };

  const dias = DIAS.map((rotulo) => ({ rotulo, qtd: 0, valor: 0, pct: 0 }));
  for (const l of validas) { const d = dias[diaDaSemanaSegDom(l.data)]; d.qtd++; d.valor += l.valor; }
  for (const d of dias) d.pct = pct(d.valor, total);

  const porSetor = agrupar(validas, (l) => l.setor ?? 'Sem setor informado', total);

  /* ── as frases ── */
  const leituras: string[] = [];
  if (validas.length === 0) {
    leituras.push('Nenhuma solicitação válida no recorte: não há o que analisar.');
  } else {
    leituras.push(`Custo do período: ${brl(total)} em ${validas.length} solicitação(ões) — ${brl(total / validas.length)} por solicitação, ${r.freelancersUnicos} pessoa(s).`);
    const { valorAntes, variacaoValorPct, anterior } = c.comparacao;
    if (variacaoValorPct !== null) {
      const sinal = variacaoValorPct > 0 ? 'acima' : 'abaixo';
      leituras.push(Math.abs(variacaoValorPct) < 0.5
        ? `Gasto estável em relação a ${anterior.rotulo} (${brl(valorAntes)}).`
        : `Gasto ${p1(Math.abs(variacaoValorPct))}% ${sinal} de ${anterior.rotulo} (${brl(valorAntes)}).`);
    }
    const u1 = porUnidade[0];
    if (u1 && porUnidade.length > 1) {
      const tres = porUnidade.slice(0, 3).reduce((s, u) => s + u.pct, 0);
      leituras.push(`${u1.rotulo} concentra ${p1(u1.pct)}% do valor${porUnidade.length > 3 ? `; as três maiores somam ${p1(tres)}%` : ''}.`);
    }
    if (recorrencia.pessoas > 0) {
      leituras.push(`${recorrencia.pessoas} freelancer(s) recorrente(s) respondem por ${p1(recorrencia.pctDoValor)}% do valor (${brl(recorrencia.valor)}) — passaram de ${c.limiteSemanal} solicitações numa mesma semana.`);
    } else {
      leituras.push(`Nenhum freelancer passou de ${c.limiteSemanal} solicitações numa mesma semana.`);
    }
    if (topFreelancers.length > 1) leituras.push(`Os ${topFreelancers.length} freelancers de maior valor somam ${p1(top5Pct)}% do total.`);
    const pend = porStatus.find((s) => s.rotulo === STATUS_ROTULO.PENDING);
    const apr = porStatus.find((s) => s.rotulo === STATUS_ROTULO.APPROVED);
    const pago = porStatus.find((s) => s.rotulo === STATUS_ROTULO.PAID);
    leituras.push(`Situação: ${brl(pago?.valor ?? 0)} pago, ${brl(apr?.valor ?? 0)} aprovado a pagar e ${brl(pend?.valor ?? 0)} ainda aguardando aprovação.`);
    const pico = [...dias].sort((a, b) => b.qtd - a.qtd)[0];
    if (pico.qtd > 0) leituras.push(`${pico.rotulo} é o dia com mais chamadas: ${pico.qtd} solicitação(ões), ${p1(pct(pico.qtd, validas.length))}% do período.`);
    if (r.rejeitadasCount > 0) leituras.push(`${r.rejeitadasCount} solicitação(ões) rejeitada(s), ${brl(r.rejeitadasValor)}, ficam fora de todos os valores.`);
  }

  return {
    ticketMedio: validas.length ? total / validas.length : null,
    valorPorFreelancer: r.freelancersUnicos ? total / r.freelancersUnicos : null,
    porStatus, porUnidade, topFreelancers, top5Pct, recorrencia, porDiaDaSemana: dias, porSetor, leituras,
  };
}

export interface RecorrenteAgrupado {
  freelancerId: string;
  nome: string;
  cpf: string | null;
  pixKey: string | null;
  unidades: string[];
  /** As semanas em que passou do limite, da mais antiga para a mais recente. */
  semanas: { de: string; ate: string; solicitacoes: number; valor: number }[];
  solicitacoes: number;
  valor: number;
}

/**
 * Um cartão por PESSOA (v1.225.0): a tabela repetia o mesmo freelancer em cada
 * semana recorrente. A conta é a mesma — só muda o agrupamento. Maior valor primeiro.
 */
export function agruparRecorrentes(linhas: RecorrenteNaSemana[]): RecorrenteAgrupado[] {
  const m = new Map<string, RecorrenteAgrupado>();
  for (const g of linhas) {
    const a = m.get(g.freelancerId) ?? { freelancerId: g.freelancerId, nome: g.nome, cpf: g.cpf, pixKey: g.pixKey, unidades: [], semanas: [], solicitacoes: 0, valor: 0 };
    a.semanas.push({ de: g.semanaDe, ate: g.semanaAte, solicitacoes: g.solicitacoes, valor: g.valor });
    a.solicitacoes += g.solicitacoes;
    a.valor += g.valor;
    for (const u of g.unidades) if (!a.unidades.includes(u)) a.unidades.push(u);
    m.set(g.freelancerId, a);
  }
  return [...m.values()]
    .map((a) => ({ ...a, semanas: a.semanas.sort((x, y) => x.de.localeCompare(y.de)) }))
    .sort((x, y) => y.valor - x.valor || y.solicitacoes - x.solicitacoes || x.nome.localeCompare(y.nome, 'pt-BR'));
}
