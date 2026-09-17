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

export const TIPO_TEXTO: Record<PaymentType, string> = { FREELANCER: 'Freelancer', OVERTIME: 'Hora Extra', MISC: 'Avulso' };
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
}

export interface FreelancerNoPeriodo {
  freelancerId: string;
  nome: string;
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
  comparacao: { anterior: Periodo; solicitacoesAntes: number; variacaoPct: number | null };
  recorrentesNaSemana: RecorrenteNaSemana[];
  porUnidade: UnidadeNoPeriodo[];
  evolucao: { granularidade: 'semana' | 'mes'; pontos: PontoDaEvolucao[] };
  freelancers: FreelancerNoPeriodo[];
}
