import type { PaymentStatus, PaymentType } from '@prisma/client';

/**
 * A parte PURA do consolidado de freelancers: tipos, rótulos e formatação.
 *
 * Mora à parte de `consolidado.ts` porque a tela é um componente cliente e
 * `consolidado.ts` importa o Prisma. Cliente alcançando módulo de servidor não
 * quebra o `tsc` nem o lint — quebra o `next build`, ou seja, depois do merge.
 * Aqui não entra nada que toque no banco.
 */

export type PeriodoKey = 'semana' | 'semana-anterior' | 'mes' | 'mes-anterior' | 'personalizado';
export type TipoFiltro = 'FREELANCER' | 'OVERTIME' | 'TODOS';
export type StatusFiltro = PaymentStatus | 'TODOS';
export type RecorrenciaFiltro = 'todos' | 'recorrentes';

export interface FiltroConsolidado {
  periodo: PeriodoKey;
  de?: string;
  ate?: string;
  unitId?: string;
  tipo: TipoFiltro;
  status: StatusFiltro;
  recorrencia: RecorrenciaFiltro;
}

export const PERIODO_LABEL: Record<PeriodoKey, string> = {
  semana: 'Esta semana',
  'semana-anterior': 'Semana anterior',
  mes: 'Este mês',
  'mes-anterior': 'Mês anterior',
  personalizado: 'Personalizado',
};

export const TIPO_LABEL: Record<TipoFiltro, string> = {
  TODOS: 'Todos',
  FREELANCER: 'Freelancer',
  OVERTIME: 'Hora Extra',
};

export const STATUS_LABEL: Record<StatusFiltro, string> = {
  TODOS: 'Todos',
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  PAID: 'Pago',
  REJECTED: 'Rejeitado',
};

export const TIPO_TEXTO: Record<PaymentType, string> = { FREELANCER: 'Freelancer', OVERTIME: 'Hora Extra', MISC: 'Reembolso' };
export const STATUS_TEXTO: Record<PaymentStatus, string> = { PENDING: 'Pendente', APPROVED: 'Aprovado', PAID: 'Pago', REJECTED: 'Rejeitado' };

export const emBR = (isoStr: string) => isoStr.split('-').reverse().join('/');

/**
 * Um período com a sua NATUREZA junto. O tipo existe para a frase de
 * comparação concordar em português: "em relação a agosto", "à semana de",
 * "ao período de". Sem ele a tela dizia "em relação a semana de 07/09".
 */
export interface Periodo { de: string; ate: string; rotulo: string; tipo: 'mes' | 'semana' | 'livre' }

export interface LinhaDoConsolidado {
  id: string;
  data: string;
  unitId: string;
  unidade: string;
  tipo: PaymentType;
  tipoLabel: string;
  status: PaymentStatus;
  statusLabel: string;
  valor: number;
  pessoa: string;
  freelancerId: string | null;
  /** Calculado pela regra da semana — não é o snapshot da linha. */
  recorrente: boolean;
  /** v1.224.0 — o discriminativo: onde, quando, por quê e quem pediu. */
  setor: string | null;
  horario: string | null;
  motivo: string | null;
  solicitadoPor: string | null;
}

export interface FreelancerNoPeriodo {
  freelancerId: string;
  nome: string;
  cpf: string | null;
  pixKey: string | null;
  solicitacoes: number;
  valor: number;
  recorrente: boolean;
  /** Quantas das solicitações foram rejeitadas — elas não entram no . */
  rejeitadas: number;
  unidades: string[];
  linhas: LinhaDoConsolidado[];
}

export interface RecorrenteNaSemana {
  chave: string;
  freelancerId: string;
  nome: string;
  cpf: string | null;
  pixKey: string | null;
  unidades: string[];
  semanaDe: string;
  semanaAte: string;
  solicitacoes: number;
  valor: number;
}

export interface UnidadeNoPeriodo {
  unitId: string;
  nome: string;
  solicitacoes: number;
  unicos: number;
  recorrentes: number;
  valor: number;
  pctRede: number;
}

export interface PontoDaEvolucao { chave: string; rotulo: string; solicitacoes: number; valor: number }

export interface Consolidado {
  periodo: Periodo;
  limiteSemanal: number;
  resumo: {
    solicitacoes: number;
    freelancersUnicos: number;
    recorrentes: number;
    valorSolicitado: number;
    valorAprovadoPago: number;
    rejeitadasCount: number;
    rejeitadasValor: number;
    mediaPorUnidade: number;
    unidadesNoEscopo: number;
  };
  comparacao: {
    anterior: Periodo; solicitacoesAntes: number; variacaoPct: number | null;
    /** v1.224.0 — o VALOR do período anterior (rejeitadas fora), com os mesmos filtros de tipo e unidade. */
    valorAntes: number; variacaoValorPct: number | null;
  };
  recorrentesNaSemana: RecorrenteNaSemana[];
  porUnidade: UnidadeNoPeriodo[];
  evolucao: { granularidade: 'semana' | 'mes'; pontos: PontoDaEvolucao[] };
  freelancers: FreelancerNoPeriodo[];
  /** v1.224.0 — TODAS as linhas do recorte (as mesmas que formam os números), para a análise e o Excel. */
  linhas: LinhaDoConsolidado[];
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const umDe = <V extends string>(v: string | null | undefined, validos: readonly V[], padrao: V): V =>
  ((validos as readonly string[]).includes(v ?? '') ? (v as V) : padrao);

/**
 * O filtro do consolidado lido da URL — UMA leitura para a tela e para o
 * Excel (v1.224.0). Unidade fora do alcance é ignorada, não recusada: o
 * recorte de verdade está no `where` do servidor.
 */
export function lerFiltroConsolidado(p: { get(k: string): string | null | undefined }, unidadesNoAlcance: string[]): FiltroConsolidado {
  const de = p.get('de') ?? '';
  const ate = p.get('ate') ?? '';
  const unidade = p.get('unidade') ?? '';
  return {
    periodo: umDe<PeriodoKey>(p.get('periodo'), ['semana', 'semana-anterior', 'mes', 'mes-anterior', 'personalizado'], 'mes'),
    de: ISO_DIA.test(de) ? de : undefined,
    ate: ISO_DIA.test(ate) ? ate : undefined,
    unitId: unidade && unidadesNoAlcance.includes(unidade) ? unidade : undefined,
    tipo: umDe<TipoFiltro>(p.get('tipo'), ['TODOS', 'FREELANCER', 'OVERTIME'], 'FREELANCER'),
    status: umDe<StatusFiltro>(p.get('status'), ['TODOS', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'], 'TODOS'),
    recorrencia: umDe<RecorrenciaFiltro>(p.get('rec'), ['todos', 'recorrentes'], 'todos'),
  };
}

/** A query string que reproduz o filtro (tela → Excel → PDF abrem no mesmo recorte). */
export function queryDoFiltroConsolidado(f: FiltroConsolidado): string {
  const q = new URLSearchParams({ aba: 'consolidado', periodo: f.periodo, tipo: f.tipo, status: f.status, rec: f.recorrencia });
  if (f.unitId) q.set('unidade', f.unitId);
  if (f.periodo === 'personalizado') {
    if (f.de) q.set('de', f.de);
    if (f.ate) q.set('ate', f.ate);
  }
  return q.toString();
}
