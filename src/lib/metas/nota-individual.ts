import type { ComponenteDaMeta } from './pontuacao';

/**
 * NOTA INDIVIDUAL DO GERENTE (v1.215.0) — a conta, sem banco.
 *
 * Pedido do Daniel (18/11/2026): "em algumas demandas nota individual e em
 * outras não", sem mexer nos pesos, com acompanhamento "real da unidade e do
 * usuário". Vale em DEZEMBRO/2026; novembro mostra a nota individual como
 * SIMULAÇÃO ao lado da oficial (a bonificação de novembro já estava valendo).
 *
 * Os PESOS não mudam. Cada componente segue com o peso da Configuração da
 * Meta; o que muda é DE ONDE vem o % nos componentes individuais:
 *
 *  - Checklists, Desperdício, Comandas e Cofre → o resultado da unidade SÓ NOS
 *    DIAS DE PLANTÃO do gerente (Escala de gerentes: padrão semanal, folgas e
 *    férias). Dia de folga dele não conta contra ele.
 *  - Comunicados → as confirmações de leitura DELE.
 *  - Demais componentes → o resultado da unidade, como sempre.
 *
 * PARTICIPAÇÃO: o que os gerentes fizeram nos dias dele é dividido igualmente
 * entre quem estava de plantão no dia — essa é a "parte que caberia a ele".
 * Se ele fez menos de 25% dessa parte, o componente cai na proporção (fez
 * 12,5% → fica com metade). Quem divide tarefa com o colega não perde; quem
 * não faz nada não herda a nota de quem faz. O que foi feito por quem não é
 * gerente (caixa, supervisor) conta para o resultado do dia e fica FORA da
 * participação — não há parte de gerente a dividir ali.
 *
 * Gerente SEM horário cadastrado é tratado como de plantão todos os dias
 * (menos nas folgas/férias lançadas) — e a tela avisa.
 *
 * A nota da UNIDADE (Metas, ranking, painel do supervisor) não passa por aqui.
 */

/** Componentes medidos dia a dia, pelo plantão. */
export const COMPONENTES_POR_PLANTAO = ['TASKS', 'WASTE', 'COMMANDS', 'CASH'] as const;
/** Componentes que já são da pessoa (um registro por destinatário). */
export const COMPONENTES_POR_PESSOA = ['COMMUNICATION'] as const;
export const COMPONENTES_INDIVIDUAIS: readonly string[] = [...COMPONENTES_POR_PLANTAO, ...COMPONENTES_POR_PESSOA];

/** Abaixo de 25% da parte que caberia a ele, o componente cai na proporção. */
export const PARTICIPACAO_MINIMA = 0.25;

export const SIMULACAO_DESDE = '2026-11';
export const OFICIAL_DESDE = '2026-12';
export type ModoIndividual = 'DESLIGADA' | 'SIMULACAO' | 'OFICIAL';
/** Mês fechado antes de novembro/2026 segue com a nota herdada da unidade. */
export function modoDaNotaIndividual(yearMonth: string): ModoIndividual {
  if (yearMonth >= OFICIAL_DESDE) return 'OFICIAL';
  return yearMonth >= SIMULACAO_DESDE ? 'SIMULACAO' : 'DESLIGADA';
}

/** O que aconteceu num dia, num componente: devido, feito e quem fez. */
export interface FatoDoDia {
  dia: string;
  feitos: number;
  devidos: number;
  /** Feitos por usuário (id → quantos). Quem não é gerente da unidade fica fora da participação. */
  porAutor: Record<string, number>;
}

export interface GerenteDoPlantao {
  userId: string;
  /** 0 = domingo … 6 = sábado. Vazio = sem horário cadastrado. */
  weekdays: number[];
  /** Folgas e férias ativas que tocam o mês. */
  ausencias: { startDate: string; endDate: string }[];
}

export interface FatosDaUnidade {
  gerentes: GerenteDoPlantao[];
  porDia: Record<string, FatoDoDia[]>;
  /** Componente → usuário → feito/não feito. */
  porPessoa: Record<string, Record<string, { done: number; missed: number }>>;
}

/** Lançamento vence o padrão semanal (a mesma ordem da grade da Escala de gerentes). */
export function estaDePlantao(g: GerenteDoPlantao, iso: string): boolean {
  if (g.ausencias.some((a) => a.startDate <= iso && a.endDate >= iso)) return false;
  if (g.weekdays.length === 0) return true;
  return g.weekdays.includes(new Date(`${iso}T00:00:00Z`).getUTCDay());
}

export interface ResultadoIndividual {
  done: number;
  missed: number;
  /** O % que entra na nota dele (já com a participação). */
  scorePct: number;
  /** Dias de plantão com algo devido (nulo nos componentes por pessoa). */
  diasDePlantao: number | null;
  /** O % da unidade nos dias dele, antes da participação. */
  pctNosDias: number;
  /** O que ele fez ÷ a parte que caberia a ele, em %. Nulo = nada de gerente a dividir. */
  participacaoPct: number | null;
  /** 100 = sem redução. */
  fatorPct: number;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Um componente diário visto por UM gerente. Nulo = nenhum dia de plantão com algo devido. */
export function componentePorPlantao(fatos: FatoDoDia[], userId: string, gerentes: GerenteDoPlantao[]): ResultadoIndividual | null {
  const eu = gerentes.find((g) => g.userId === userId);
  if (!eu) return null;
  const ids = new Set(gerentes.map((g) => g.userId));
  let done = 0; let devidos = 0; let dias = 0; let parte = 0;
  for (const f of fatos) {
    if (f.devidos <= 0 || !estaDePlantao(eu, f.dia)) continue;
    dias++;
    done += Math.min(f.feitos, f.devidos);
    devidos += f.devidos;
    const deGerentes = Object.entries(f.porAutor).reduce((s, [id, n]) => s + (ids.has(id) ? n : 0), 0);
    const noDia = gerentes.filter((g) => estaDePlantao(g, f.dia)).length || 1;
    parte += deGerentes / noDia;
  }
  if (devidos === 0) return null;
  /* O que ele fez conta em qualquer dia do mês: fazer na folga não pode jogar contra. */
  const meus = fatos.reduce((s, f) => s + (f.porAutor[userId] ?? 0), 0);
  const participacao = parte > 0 ? meus / parte : null;
  const fator = participacao == null ? 1 : Math.min(1, participacao / PARTICIPACAO_MINIMA);
  const base = done / devidos;
  return {
    done, missed: devidos - done,
    scorePct: Math.round(base * fator * 100),
    diasDePlantao: dias,
    pctNosDias: Math.round(base * 100),
    participacaoPct: participacao == null ? null : Math.round(participacao * 100),
    fatorPct: Math.round(fator * 100),
  };
}

/**
 * Todos os componentes individuais de um gerente numa unidade. Chave presente
 * com `null` = nada a medir PARA ELE (o componente sai da conta dele); chave
 * ausente = o componente segue o da unidade. Quem não é gerente da unidade
 * recebe `null` (segue a unidade em tudo).
 */
export function individuaisDoGerente(f: FatosDaUnidade, userId: string): Record<string, ResultadoIndividual | null> | null {
  if (!f.gerentes.some((g) => g.userId === userId)) return null;
  const out: Record<string, ResultadoIndividual | null> = {};
  for (const [key, fatos] of Object.entries(f.porDia)) out[key] = componentePorPlantao(fatos, userId, f.gerentes);
  for (const [key, pessoas] of Object.entries(f.porPessoa)) {
    const p = pessoas[userId];
    const total = p ? p.done + p.missed : 0;
    out[key] = p && total > 0
      ? { done: p.done, missed: p.missed, scorePct: pct(p.done, total), diasDePlantao: null, pctNosDias: pct(p.done, total), participacaoPct: null, fatorPct: 100 }
      : null;
  }
  return out;
}

/** Troca, na lista da unidade, os componentes individuais pelos do gerente. Peso e status não mudam. */
export function aplicarIndividuais(componentes: ComponenteDaMeta[], ind: Record<string, ResultadoIndividual | null>): ComponenteDaMeta[] {
  return componentes.map((c) => {
    if (!(c.key in ind)) return c;
    const r = ind[c.key];
    if (!r) return { ...c, done: 0, missed: 0, scorePct: undefined };
    /* Sem redução, vale feito ÷ devido exato; com redução, o % já pronto. */
    return { ...c, done: r.done, missed: r.missed, scorePct: r.fatorPct < 100 ? r.scorePct : undefined };
  });
}

export const semHorario = (f: FatosDaUnidade, userId: string) => f.gerentes.some((g) => g.userId === userId && g.weekdays.length === 0);
