import type { PaymentStatus } from '@prisma/client';
import { PERIODOS_RAPIDOS, STATUS_TEXTO, resolverPeriodo, type PeriodoRapido, type PeriodoResolvido } from '@/lib/payments/consolidacao-calculo';

/**
 * REEMBOLSO (v1.169.0) — o que o SGO chamava de "Pagamento Avulso".
 *
 * É o dinheiro que o funcionário gastou do próprio bolso (passagem, uma
 * despesa) ou a diferença de um pagamento calculado errado. A chave no banco
 * continua `MISC` (nada migra); mudou o NOME e a folha: o beneficiário virou o
 * COLABORADOR DO RH (obrigatório), com data da despesa, motivo do catálogo,
 * descrição e comprovante. Este arquivo é a parte PURA: filtro na URL,
 * linhas da planilha e totais — a tela, a página e o Excel leem daqui.
 */

export const REEMBOLSO_LABEL = 'Reembolso';

export type StatusReembolso = 'TODOS' | PaymentStatus;
export const STATUS_REEMBOLSO: { value: StatusReembolso; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'APPROVED', label: 'Aprovado (a pagar)' },
  { value: 'PAID', label: 'Pago' },
  { value: 'REJECTED', label: 'Rejeitado' },
];

export interface FiltroReembolso {
  periodo: PeriodoRapido;
  de: string;
  ate: string;
  unitId: string; // '' = todas do alcance
  status: StatusReembolso;
}

const PERIODOS = new Set(PERIODOS_RAPIDOS.map((p) => p.value));
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Filtro lido da URL — a página, o botão de Excel e a rota leem o MESMO. Padrão: este mês. */
export function lerFiltroReembolso(sp: { get(k: string): string | null }): FiltroReembolso {
  const periodo = (sp.get('periodo') ?? 'mes') as PeriodoRapido;
  const status = (sp.get('status') ?? 'TODOS') as StatusReembolso;
  return {
    periodo: PERIODOS.has(periodo) ? periodo : 'mes',
    de: YMD.test(sp.get('de') ?? '') ? sp.get('de')! : '',
    ate: YMD.test(sp.get('ate') ?? '') ? sp.get('ate')! : '',
    unitId: sp.get('unit') ?? '',
    status: STATUS_REEMBOLSO.some((s) => s.value === status) ? status : 'TODOS',
  };
}

export function queryDoFiltroReembolso(f: FiltroReembolso): string {
  const q = new URLSearchParams();
  q.set('periodo', f.periodo);
  if (f.periodo === 'personalizado') { if (f.de) q.set('de', f.de); if (f.ate) q.set('ate', f.ate); }
  if (f.unitId) q.set('unit', f.unitId);
  if (f.status !== 'TODOS') q.set('status', f.status);
  return q.toString();
}

export function periodoDoFiltro(f: FiltroReembolso, hoje: string): PeriodoResolvido {
  return resolverPeriodo(f, hoje);
}

/** Uma linha = um reembolso, já com tudo que a planilha mostra. */
export interface LinhaReembolso {
  id: string;
  unitId: string;
  unidade: string;
  /** Data da despesa (AAAA-MM-DD) — pode faltar nos registros anteriores à v1.169.0. */
  dataDespesa: string | null;
  /** Data da solicitação (AAAA-MM-DD, Brasília). */
  dataSolicitacao: string;
  colaboradorId: string | null;
  colaborador: string;
  cpf: string | null;
  motivo: string;
  descricao: string;
  valor: number;
  status: PaymentStatus;
  solicitadoPor: string;
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  pagoPor: string | null;
  pagoEm: string | null;
  comprovante: boolean;
  rejeicao: string | null;
}

export const statusTexto = (s: PaymentStatus) => STATUS_TEXTO[s];

export interface ResumoReembolsos {
  quantidade: number;
  total: number;
  pendente: number;
  aPagar: number;
  pago: number;
  rejeitado: number;
  semComprovante: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Totais do recorte. Rejeitado fica fora do total (não é dinheiro devido). */
export function resumirReembolsos(xs: LinhaReembolso[]): ResumoReembolsos {
  const soma = (f: (l: LinhaReembolso) => boolean) => r2(xs.filter(f).reduce((s, l) => s + l.valor, 0));
  return {
    quantidade: xs.length,
    total: soma((l) => l.status !== 'REJECTED'),
    pendente: soma((l) => l.status === 'PENDING'),
    aPagar: soma((l) => l.status === 'APPROVED'),
    pago: soma((l) => l.status === 'PAID'),
    rejeitado: soma((l) => l.status === 'REJECTED'),
    semComprovante: xs.filter((l) => !l.comprovante && l.status !== 'REJECTED').length,
  };
}

export interface ReembolsoPorColaborador {
  chave: string;
  colaborador: string;
  cpf: string | null;
  unidades: string[];
  quantidade: number;
  total: number;
  pago: number;
  pendente: number; // pendente + aprovado (ainda não pago)
}

/**
 * Agrupa por PESSOA (id do colaborador; sem id — registro antigo — pelo nome
 * digitado). Rejeitado não entra. Ordem: maior total primeiro.
 */
export function porColaboradorReembolso(xs: LinhaReembolso[]): ReembolsoPorColaborador[] {
  const m = new Map<string, ReembolsoPorColaborador>();
  for (const l of xs) {
    if (l.status === 'REJECTED') continue;
    const chave = l.colaboradorId ?? `nome:${l.colaborador.trim().toLowerCase()}`;
    const g = m.get(chave) ?? { chave, colaborador: l.colaborador, cpf: l.cpf, unidades: [], quantidade: 0, total: 0, pago: 0, pendente: 0 };
    g.quantidade++;
    g.total = r2(g.total + l.valor);
    if (l.status === 'PAID') g.pago = r2(g.pago + l.valor); else g.pendente = r2(g.pendente + l.valor);
    if (!g.unidades.includes(l.unidade)) g.unidades.push(l.unidade);
    if (!g.cpf && l.cpf) g.cpf = l.cpf;
    m.set(chave, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.colaborador.localeCompare(b.colaborador, 'pt-BR'));
}

/** O caminho do comprovante só pode apontar para o volume da PRÓPRIA unidade. */
export function comprovanteValido(path: string | undefined | null, unitId: string): boolean {
  if (!path) return true;
  return new RegExp(`^uploads/${unitId.replace(/[^a-zA-Z0-9_-]/g, '')}/[A-Za-z0-9_.-]+$`).test(path);
}
