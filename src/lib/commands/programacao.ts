/**
 * PROGRAMAÇÃO das conferências de comandas (v1.201.0) — núcleo PURO.
 *
 * Separa duas coisas que viviam coladas:
 *  - o CADASTRO físico (`CommandSequence`: quais números existem — sem duplicidade);
 *  - a REGRA de conferência (esta): quando e o que conferir. Seg–Sex 1–300,
 *    Sáb/Dom 1–500, completa 1–700 aos domingos, turno da noite…
 *
 * Programações podem se SOBREPOR entre si (a faixa do dia está dentro da
 * completa); o que nunca se duplica é o cadastro. Quando mais de uma vale no
 * mesmo instante, uma vence por regra explícita (`escolherProgramacao`).
 */

export type TipoProgramado = 'FAIXA_DO_DIA' | 'COMPLETA';

export interface Programacao {
  id: string;
  nome: string;
  tipo: TipoProgramado;
  /** 0 = domingo … 6 = sábado, pelo dia OPERACIONAL. */
  dias: number[];
  /** Turno em hora local; nulos = o dia todo. fim < início cruza a meia-noite. */
  inicioHora: number | null;
  fimHora: number | null;
  faixaDe: number | null;
  faixaAte: number | null;
  prioridade: number;
  ativa: boolean;
}

export interface Excecao {
  id: string;
  data: string;
  nome: string;
  semConferencia: boolean;
  tipo: TipoProgramado | null;
  faixaDe: number | null;
  faixaAte: number | null;
}

export type OrigemDaProgramacao = 'EXCECAO' | 'PROGRAMACAO' | 'PADRAO';

export interface ProgramacaoDoDia {
  origem: OrigemDaProgramacao;
  nome: string | null;
  /** Nulo em PADRAO (vale o comportamento de sempre: faixas "madrugada", senão tudo). */
  tipo: TipoProgramado | null;
  faixa: { de: number; ate: number } | null;
  /** Exceção "sem conferência neste dia" — informativo; não impede conferir. */
  semConferencia: boolean;
  /** Outras programações que também valiam neste instante e perderam. */
  concorrentes: string[];
}

export const NOME_DO_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
const CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/** Dia da semana de 'AAAA-MM-DD' (0 = domingo). Calendário puro — sem fuso. */
export function diaDaSemana(data: string): number {
  const [y, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A hora local cai no turno? Sem turno (qualquer ponta nula) ou início = fim vale o dia todo. */
export function noTurno(hora: number, inicio: number | null, fim: number | null): boolean {
  if (inicio === null || fim === null || inicio === fim) return true;
  return inicio < fim ? hora >= inicio && hora < fim : hora >= inicio || hora < fim;
}

/** "Seg a Sex", "Sáb e Dom", "Seg, Qua e Sex". */
export function rotuloDosDias(dias: number[]): string {
  const ord = [...new Set(dias)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (ord.length === 7) return 'Todos os dias';
  /* semana começando na segunda: domingo (0) vai para o fim */
  const seg = ord.map((d) => (d + 6) % 7).sort((a, b) => a - b);
  const grupos: number[][] = [];
  for (const d of seg) {
    const g = grupos[grupos.length - 1];
    if (g && g[g.length - 1] === d - 1) g.push(d); else grupos.push([d]);
  }
  const itens = grupos.flatMap((g) => (g.length >= 3 ? [`${CURTO[(g[0] + 1) % 7]} a ${CURTO[(g[g.length - 1] + 1) % 7]}`] : g.map((d) => CURTO[(d + 1) % 7])));
  if (itens.length === 0) return '—';
  return itens.length === 1 ? itens[0] : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

export function rotuloDoTurno(inicio: number | null, fim: number | null): string {
  if (inicio === null || fim === null || inicio === fim) return 'o dia todo';
  const h = (n: number) => `${String(n).padStart(2, '0')}h`;
  return `${h(inicio)} às ${h(fim)}`;
}

function faixaDe(p: { tipo: TipoProgramado | null; faixaDe: number | null; faixaAte: number | null }) {
  return p.tipo === 'FAIXA_DO_DIA' && p.faixaDe !== null && p.faixaAte !== null ? { de: p.faixaDe, ate: p.faixaAte } : null;
}

/**
 * Qual programação vale para (data operacional, hora local)?
 *
 * 1. EXCEÇÃO da data vence tudo (feriado, evento).
 * 2. Entre as programações ativas que cobrem o dia da semana e o turno:
 *    maior `prioridade`; empate → a de turno definido (mais específica) sobre a
 *    do dia todo; empate → a COMPLETA sobre a faixa (ela já contém a faixa);
 *    empate → a mais antiga (id) — determinístico, nunca depende da ordem do banco.
 * 3. Nenhuma → PADRAO (comportamento de antes da programação).
 */
export function escolherProgramacao(input: {
  programacoes: Programacao[];
  excecao: Excecao | null;
  data: string;
  hora: number;
}): ProgramacaoDoDia {
  const { programacoes, excecao, data, hora } = input;

  if (excecao) {
    if (excecao.semConferencia || !excecao.tipo) {
      return { origem: 'EXCECAO', nome: excecao.nome, tipo: null, faixa: null, semConferencia: true, concorrentes: [] };
    }
    return { origem: 'EXCECAO', nome: excecao.nome, tipo: excecao.tipo, faixa: faixaDe(excecao), semConferencia: false, concorrentes: [] };
  }

  const dia = diaDaSemana(data);
  const validas = programacoes
    .filter((p) => p.ativa && p.dias.includes(dia) && noTurno(hora, p.inicioHora, p.fimHora))
    .sort((a, b) => {
      if (b.prioridade !== a.prioridade) return b.prioridade - a.prioridade;
      const ea = a.inicioHora !== null && a.fimHora !== null && a.inicioHora !== a.fimHora ? 1 : 0;
      const eb = b.inicioHora !== null && b.fimHora !== null && b.inicioHora !== b.fimHora ? 1 : 0;
      if (eb !== ea) return eb - ea;
      if (a.tipo !== b.tipo) return a.tipo === 'COMPLETA' ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const v = validas[0];
  if (!v) return { origem: 'PADRAO', nome: null, tipo: null, faixa: null, semConferencia: false, concorrentes: [] };
  return { origem: 'PROGRAMACAO', nome: v.nome, tipo: v.tipo, faixa: faixaDe({ tipo: v.tipo, faixaDe: v.faixaDe, faixaAte: v.faixaAte }), semConferencia: false, concorrentes: validas.slice(1).map((p) => p.nome) };
}

/** Os números que a programação pede para conferir, dentro do cadastro. `null` = a sequência inteira. */
export function numerosDaProgramacao(p: ProgramacaoDoDia, cadastrados: Iterable<number>): number[] | null {
  if (p.tipo !== 'FAIXA_DO_DIA' || !p.faixa) return null;
  const { de, ate } = p.faixa;
  return [...cadastrados].filter((n) => n >= de && n <= ate).sort((a, b) => a - b);
}

export type MotivoInvalido = 'NOME' | 'TIPO' | 'DIAS' | 'TURNO' | 'FAIXA' | 'SEM_COMANDAS' | 'PRIORIDADE' | 'DATA';

export interface EntradaDeProgramacao {
  nome?: unknown; tipo?: unknown; dias?: unknown; inicioHora?: unknown; fimHora?: unknown;
  faixaDe?: unknown; faixaAte?: unknown; prioridade?: unknown;
}

const ehHora = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23;
const ehInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

/**
 * Valida e normaliza. A faixa precisa conter ao menos uma comanda do CADASTRO —
 * programar a conferência de um número que não existe esvaziaria a conferência
 * em silêncio. (Sobrepor outra programação é permitido; o cadastro é que não duplica.)
 */
export function normalizarProgramacao(
  e: EntradaDeProgramacao,
  cadastrados: Set<number>,
): { ok: true; valor: Omit<Programacao, 'id' | 'ativa'> } | { ok: false; motivo: MotivoInvalido; detalhe: string } {
  const nome = typeof e.nome === 'string' ? e.nome.trim() : '';
  if (nome.length < 2) return { ok: false, motivo: 'NOME', detalhe: 'Dê um nome à programação.' };
  if (e.tipo !== 'FAIXA_DO_DIA' && e.tipo !== 'COMPLETA') return { ok: false, motivo: 'TIPO', detalhe: 'Escolha faixa do dia ou completa.' };
  const dias = Array.isArray(e.dias) ? [...new Set(e.dias.filter((d): d is number => ehInt(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : [];
  if (dias.length === 0) return { ok: false, motivo: 'DIAS', detalhe: 'Marque ao menos um dia da semana.' };
  const temIni = e.inicioHora !== null && e.inicioHora !== undefined && e.inicioHora !== '';
  const temFim = e.fimHora !== null && e.fimHora !== undefined && e.fimHora !== '';
  if (temIni !== temFim || (temIni && (!ehHora(e.inicioHora) || !ehHora(e.fimHora)))) {
    return { ok: false, motivo: 'TURNO', detalhe: 'Turno: informe início e fim (horas de 0 a 23) ou deixe os dois vazios.' };
  }
  const prioridade = e.prioridade === undefined || e.prioridade === null || e.prioridade === '' ? 0 : e.prioridade;
  if (!ehInt(prioridade) || (prioridade as number) < 0 || (prioridade as number) > 99) return { ok: false, motivo: 'PRIORIDADE', detalhe: 'Prioridade de 0 a 99.' };

  let faixaDe: number | null = null;
  let faixaAte: number | null = null;
  if (e.tipo === 'FAIXA_DO_DIA') {
    if (!ehInt(e.faixaDe) || !ehInt(e.faixaAte) || (e.faixaDe as number) < 1 || (e.faixaAte as number) < (e.faixaDe as number)) {
      return { ok: false, motivo: 'FAIXA', detalhe: 'Informe a faixa (de 1 em diante, "até" não menor que "de").' };
    }
    faixaDe = e.faixaDe as number; faixaAte = e.faixaAte as number;
    let temComanda = false;
    for (const n of cadastrados) if (n >= faixaDe && n <= faixaAte) { temComanda = true; break; }
    if (!temComanda) return { ok: false, motivo: 'SEM_COMANDAS', detalhe: 'Nenhuma comanda cadastrada nesta faixa. Cadastre a sequência em Configurações → Comandas antes.' };
  }
  return {
    ok: true,
    valor: {
      nome, tipo: e.tipo, dias,
      inicioHora: temIni ? (e.inicioHora as number) : null,
      fimHora: temFim ? (e.fimHora as number) : null,
      faixaDe, faixaAte, prioridade: prioridade as number,
    },
  };
}

export function normalizarExcecao(
  e: { data?: unknown; nome?: unknown; semConferencia?: unknown; tipo?: unknown; faixaDe?: unknown; faixaAte?: unknown },
  cadastrados: Set<number>,
): { ok: true; valor: Omit<Excecao, 'id'> } | { ok: false; motivo: MotivoInvalido; detalhe: string } {
  const data = typeof e.data === 'string' ? e.data : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) return { ok: false, motivo: 'DATA', detalhe: 'Informe a data da exceção.' };
  const nome = typeof e.nome === 'string' ? e.nome.trim() : '';
  if (nome.length < 2) return { ok: false, motivo: 'NOME', detalhe: 'Diga o motivo (feriado, evento…).' };
  if (e.semConferencia === true) return { ok: true, valor: { data, nome, semConferencia: true, tipo: null, faixaDe: null, faixaAte: null } };
  const r = normalizarProgramacao({ nome, tipo: e.tipo, dias: [0], faixaDe: e.faixaDe, faixaAte: e.faixaAte }, cadastrados);
  if (!r.ok) return r;
  return { ok: true, valor: { data, nome, semConferencia: false, tipo: r.valor.tipo, faixaDe: r.valor.faixaDe, faixaAte: r.valor.faixaAte } };
}

/** Texto curto para a tela: "Faixa do dia 1–300 (Seg a Sex)". */
export function descreverProgramacaoDoDia(p: ProgramacaoDoDia): string {
  if (p.semConferencia) return `${p.nome ?? 'Exceção'}: sem conferência programada hoje`;
  if (p.origem === 'PADRAO') return 'Sem programação para hoje — vale a rotina padrão da unidade';
  const o = p.origem === 'EXCECAO' ? `${p.nome} (exceção)` : p.nome;
  return p.tipo === 'COMPLETA' ? `${o}: conferência completa` : `${o}: faixa do dia ${p.faixa?.de}–${p.faixa?.ate}`;
}

/**
 * O dia é PREVISTO para conferência? (v1.202.0) Exceção da data decide (sem
 * conferência = não previsto); sem nenhuma programação ativa a unidade confere
 * todo dia (a rotina de sempre); com programação, vale o dia da semana dela.
 * O turno não entra: a pergunta é "era dia de conferir?", não "a que horas".
 */
export function diaPrevisto(programacoes: Programacao[], excecao: Excecao | null, data: string): boolean {
  if (excecao) return !excecao.semConferencia;
  const ativas = programacoes.filter((p) => p.ativa);
  if (ativas.length === 0) return true;
  const dia = diaDaSemana(data);
  return ativas.some((p) => p.dias.includes(dia));
}
