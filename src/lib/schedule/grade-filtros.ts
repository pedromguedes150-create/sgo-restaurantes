/**
 * A GRADE DA ESCALA VISTA POR PARTES — filtros, blocos e totais (fase 2).
 *
 * Tudo aqui é conta sobre linhas que a grade JÁ montou (`getScheduleGrid`):
 * nenhuma regra de escala mora neste arquivo. O que ele responde é o que o
 * gerente pergunta olhando a grade de 30 pessoas × 31 dias — "quem é da
 * Cozinha?", "quantas faltas tivemos?", "quem está divergindo do planejado?" —
 * e responde SOBRE O QUE ESTÁ NA TELA: filtrou o setor, os quatro blocos e os
 * totais são daquele setor. Um bloco que somasse a unidade inteira ao lado de
 * uma grade filtrada diria dois números que não conversam.
 *
 * Puro: sem Prisma, sem React.
 */

export type DayStatus = 'WORK' | 'OFF' | 'FALTA_INJUST' | 'FALTA_JUST' | 'ATESTADO' | 'FERIAS' | 'ATRASO';
export type ModoDaGrade = 'planejado' | 'realizado' | 'comparacao';

export interface CelulaDaGrade { planned: DayStatus; actual: DayStatus | null }
export interface LinhaDaGrade {
  collaboratorId: string;
  name: string;
  jobTitle: string | null;
  typeLabel: string;
  shiftLabel: string | null;
  /** Setor(es) do Mapa de Funções em que a pessoa está alocada. */
  setores?: string[];
  days: CelulaDaGrade[];
}

export interface FiltrosDaGrade {
  nome?: string;
  tipo?: string;
  setor?: string;
  horario?: string;
  /** Só na Comparação: esconde quem não divergiu do planejado no mês. */
  soDivergentes?: boolean;
}

export const SEM_SETOR = 'Sem setor';

/** Ausência = o que não é presença nem folga: falta, atestado, férias. */
export const AUSENCIAS: DayStatus[] = ['FALTA_INJUST', 'FALTA_JUST', 'ATESTADO', 'FERIAS'];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();

/** O status que a aba mostra naquela célula (na Comparação vale o realizado, se houver). */
function statusNoModo(c: CelulaDaGrade, modo: ModoDaGrade): DayStatus | null {
  if (modo === 'planejado') return c.planned;
  if (modo === 'realizado') return c.actual;
  return c.actual ?? c.planned;
}

/** Divergiu = tem realizado E ele é diferente do planejado. Célula vazia não diverge. */
export function celulaDivergente(c: CelulaDaGrade): boolean {
  return c.actual !== null && c.actual !== c.planned;
}

export function linhaDivergente(l: LinhaDaGrade): boolean {
  return l.days.some(celulaDivergente);
}

/**
 * Aplica os filtros. Vazio = não filtra — e "Sem setor" é valor legítimo de
 * filtro, porque quem não está alocado em setor nenhum é justamente quem o
 * gerente precisa achar para alocar.
 */
export function filtrarLinhas(linhas: LinhaDaGrade[], f: FiltrosDaGrade, modo: ModoDaGrade): LinhaDaGrade[] {
  const nome = f.nome ? normalizar(f.nome) : '';
  return linhas.filter((l) => {
    if (nome && !normalizar(l.name).includes(nome) && !normalizar(l.jobTitle ?? '').includes(nome)) return false;
    if (f.tipo && l.typeLabel !== f.tipo) return false;
    if (f.setor) {
      const setores = l.setores && l.setores.length > 0 ? l.setores : [SEM_SETOR];
      if (!setores.includes(f.setor)) return false;
    }
    if (f.horario && (l.shiftLabel ?? '') !== f.horario) return false;
    if (modo === 'comparacao' && f.soDivergentes && !linhaDivergente(l)) return false;
    return true;
  });
}

/** As opções de cada filtro, tiradas do que existe na grade — nada fixo no código. */
export function opcoesDosFiltros(linhas: LinhaDaGrade[]): { tipos: string[]; setores: string[]; horarios: string[] } {
  const tipos = new Set<string>();
  const setores = new Set<string>();
  const horarios = new Set<string>();
  let semSetor = false;
  for (const l of linhas) {
    tipos.add(l.typeLabel);
    if (l.setores && l.setores.length > 0) l.setores.forEach((s) => setores.add(s));
    else semSetor = true;
    if (l.shiftLabel) horarios.add(l.shiftLabel);
  }
  const ordenar = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    tipos: ordenar(tipos),
    /* "Sem setor" vai por ÚLTIMO: é a exceção a resolver, não um setor. */
    setores: [...ordenar(setores), ...(semSetor ? [SEM_SETOR] : [])],
    horarios: ordenar(horarios),
  };
}

export interface TotaisDaLinha {
  trabalho: number;
  folgas: number;
  ausencias: number;
  divergencias: number;
  /** Dias ainda sem marcação (só faz sentido no Realizado). */
  vazios: number;
}

/**
 * Os totais de UMA pessoa no mês, na aba em questão. Atraso conta como
 * trabalho — a pessoa esteve lá — e aparece à parte só na legenda da grade.
 */
export function totaisDaLinha(l: LinhaDaGrade, modo: ModoDaGrade): TotaisDaLinha {
  const t: TotaisDaLinha = { trabalho: 0, folgas: 0, ausencias: 0, divergencias: 0, vazios: 0 };
  for (const c of l.days) {
    const s = statusNoModo(c, modo);
    if (s === null) { t.vazios++; continue; }
    if (s === 'WORK' || s === 'ATRASO') t.trabalho++;
    else if (s === 'OFF') t.folgas++;
    else if (AUSENCIAS.includes(s)) t.ausencias++;
    if (celulaDivergente(c)) t.divergencias++;
  }
  return t;
}

export interface ResumoDaGrade extends TotaisDaLinha {
  pessoas: number;
  porAusencia: Record<'FALTA_INJUST' | 'FALTA_JUST' | 'ATESTADO' | 'FERIAS', number>;
  /** Quantas PESSOAS têm ao menos um dia divergente. */
  pessoasDivergentes: number;
}

/** Os quatro blocos acima da grade — a soma das linhas VISÍVEIS. */
export function resumoDaGrade(linhas: LinhaDaGrade[], modo: ModoDaGrade): ResumoDaGrade {
  const r: ResumoDaGrade = {
    pessoas: linhas.length, trabalho: 0, folgas: 0, ausencias: 0, divergencias: 0, vazios: 0,
    porAusencia: { FALTA_INJUST: 0, FALTA_JUST: 0, ATESTADO: 0, FERIAS: 0 },
    pessoasDivergentes: 0,
  };
  for (const l of linhas) {
    const t = totaisDaLinha(l, modo);
    r.trabalho += t.trabalho; r.folgas += t.folgas; r.ausencias += t.ausencias; r.divergencias += t.divergencias; r.vazios += t.vazios;
    if (t.divergencias > 0) r.pessoasDivergentes++;
    for (const c of l.days) {
      const s = statusNoModo(c, modo);
      if (s && s in r.porAusencia) r.porAusencia[s as keyof ResumoDaGrade['porAusencia']]++;
    }
  }
  return r;
}

/** "FI 2 · FJ 1 · A 3" — só o que existe; vazio quando não há ausência nenhuma. */
export function detalheDasAusencias(r: ResumoDaGrade): string {
  const partes: string[] = [];
  if (r.porAusencia.FALTA_INJUST) partes.push(`FI ${r.porAusencia.FALTA_INJUST}`);
  if (r.porAusencia.FALTA_JUST) partes.push(`FJ ${r.porAusencia.FALTA_JUST}`);
  if (r.porAusencia.ATESTADO) partes.push(`A ${r.porAusencia.ATESTADO}`);
  if (r.porAusencia.FERIAS) partes.push(`FE ${r.porAusencia.FERIAS}`);
  return partes.join(' · ');
}
