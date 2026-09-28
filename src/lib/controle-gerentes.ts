/**
 * CONTROLE DE GERENTES — o núcleo PURO (sem banco, sem import).
 *
 * Cada unidade tem a SUA gestão de gerentes. Tudo aqui recebe os gerentes de
 * UMA unidade e devolve números e quadros dessa unidade; a visão da rede só
 * empilha resultados já calculados unidade a unidade. Não existe caminho que
 * junte gerentes de duas unidades numa lista só — foi assim que a lista antiga
 * misturava ("Centro, Orla" como se fosse uma unidade).
 *
 * Datas em 'AAAA-MM-DD' e contas em UTC sobre y/m/d, como o resto do sistema:
 * o fuso do servidor nunca desloca o dia. A semana vai de SEGUNDA a DOMINGO,
 * que é como a operação lê ("Seg 28 … Dom 04").
 *
 * Nenhum import de propósito: a tela (componente cliente) usa estas mesmas
 * funções, e alcançar módulo de servidor do cliente quebra o `next build`.
 */

export type TipoDeAusencia = 'FOLGA' | 'FERIAS';
/** O que o dia diz sobre o gerente na grade do Controle: folga, férias ou nada. */
export type MarcaDoDia = TipoDeAusencia | null;

export interface AusenciaCrua {
  kind: TipoDeAusencia;
  startDate: string;
  endDate: string;
  note: string | null;
}

export interface GerenteCru {
  userId: string;
  name: string;
  /** Dias da semana de trabalho (0=dom..6=sáb). Vazio = sem horário cadastrado. */
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  ausencias: AusenciaCrua[];
}

export interface Dia { iso: string; day: number; weekday: number }

export const DIA_CURTO = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const DIA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIA_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const SIGLA: Record<TipoDeAusencia, string> = { FOLGA: 'F', FERIAS: 'FE' };
export const ROTULO: Record<TipoDeAusencia, string> = { FOLGA: 'Folga', FERIAS: 'Férias' };

/* ───────────────────────────── datas ───────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function partes(iso: string): { y: number; m: number; d: number } {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

export function diaDaSemana(iso: string): number {
  const { y, m, d } = partes(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function somarDias(iso: string, n: number): string {
  const { y, m, d } = partes(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function dia(iso: string): Dia {
  return { iso, day: partes(iso).d, weekday: diaDaSemana(iso) };
}

export function diasDoMes(year: number, month: number): Dia[] {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => dia(toISO(year, month, i + 1)));
}

export function diasEntre(de: string, ate: string): Dia[] {
  const out: Dia[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) out.push(dia(d));
  return out;
}

/** Segunda a domingo da semana que contém `iso`. */
export function semanaDe(iso: string): { de: string; ate: string } {
  const wd = diaDaSemana(iso); // 0 = domingo
  const deSegunda = wd === 0 ? 6 : wd - 1;
  const de = somarDias(iso, -deSegunda);
  return { de, ate: somarDias(de, 6) };
}

export function mesAnterior(year: number, month: number) { return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }; }
export function mesSeguinte(year: number, month: number) { return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }; }

/** '2026-09-28' → '28/09'. */
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** '2026-09-28' → '28/09/2026'. */
export const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/* ─────────────────────────── períodos ─────────────────────────── */

export type Periodo = 'hoje' | 'semana' | 'proxima' | 'mes';
export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'proxima', label: 'Próxima semana' },
  { value: 'mes', label: 'Mês' },
];

export function ehPeriodo(v: unknown): v is Periodo {
  return v === 'hoje' || v === 'semana' || v === 'proxima' || v === 'mes';
}

/**
 * O intervalo de cada período. Hoje, esta semana e a próxima contam a partir de
 * HOJE (é a pergunta "quem folga esta semana?"); o mês é o mês ESCOLHIDO na tela.
 */
export function intervaloDoPeriodo(p: Periodo, hoje: string, year: number, month: number): { de: string; ate: string } {
  if (p === 'hoje') return { de: hoje, ate: hoje };
  if (p === 'semana') return semanaDe(hoje);
  if (p === 'proxima') return semanaDe(somarDias(semanaDe(hoje).ate, 1));
  const ds = diasDoMes(year, month);
  return { de: ds[0].iso, ate: ds[ds.length - 1].iso };
}

/* ─────────────────────────── a unidade ─────────────────────────── */

export function marcaNoDia(g: GerenteCru, iso: string): MarcaDoDia {
  const a = g.ausencias.find((x) => x.startDate <= iso && x.endDate >= iso);
  return a ? a.kind : null;
}

/**
 * Nenhum gerente com horário cadastrado trabalha neste dia (férias e folga
 * vencem o padrão semanal). Só acusa quando existe ao menos um horário — numa
 * unidade sem horário nenhum o mês inteiro sairia vermelho, e alerta que aparece
 * sempre deixa de ser lido. É a mesma regra da Escala de gerentes.
 */
export function semGerenteNoDia(gerentes: GerenteCru[], iso: string): boolean {
  const comHorario = gerentes.filter((g) => g.weekdays.length > 0);
  if (comHorario.length === 0) return false;
  const wd = diaDaSemana(iso);
  return !comHorario.some((g) => g.weekdays.includes(wd) && marcaNoDia(g, iso) === null);
}

export interface LinhaDoControle {
  userId: string;
  name: string;
  horario: string;
  dias: MarcaDoDia[];
  folgas: number;
  ferias: number;
}

export interface GradeDoControle {
  dias: (Dia & { semGerente: boolean })[];
  linhas: LinhaDoControle[];
}

export function textoDoHorario(g: GerenteCru): string {
  if (g.weekdays.length === 0) return 'sem horário cadastrado';
  const dias = g.weekdays.map((w) => DIA_ABREV[w]).join(', ');
  return g.startTime || g.endTime ? `${dias} · ${g.startTime ?? ''}–${g.endTime ?? ''}` : dias;
}

/** Uma linha por gerente DA UNIDADE, uma coluna por dia do mês: F, FE ou nada. */
export function montarGrade(gerentes: GerenteCru[], year: number, month: number): GradeDoControle {
  const dias = diasDoMes(year, month);
  return {
    dias: dias.map((d) => ({ ...d, semGerente: semGerenteNoDia(gerentes, d.iso) })),
    linhas: [...gerentes]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((g) => {
        const marcas = dias.map((d) => marcaNoDia(g, d.iso));
        return {
          userId: g.userId,
          name: g.name,
          horario: textoDoHorario(g),
          dias: marcas,
          folgas: marcas.filter((m) => m === 'FOLGA').length,
          ferias: marcas.filter((m) => m === 'FERIAS').length,
        };
      }),
  };
}

export interface AusenteNoDia { userId: string; name: string; kind: TipoDeAusencia; note: string | null }
export interface DiaComAusencias extends Dia { ausentes: AusenteNoDia[]; semGerente: boolean }

/** Dia a dia do intervalo: quem desta unidade está de folga ou férias. */
export function ausenciasPorDia(gerentes: GerenteCru[], de: string, ate: string): DiaComAusencias[] {
  const ordenados = [...gerentes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return diasEntre(de, ate).map((d) => ({
    ...d,
    semGerente: semGerenteNoDia(gerentes, d.iso),
    ausentes: ordenados.flatMap((g) => {
      const a = g.ausencias.find((x) => x.startDate <= d.iso && x.endDate >= d.iso);
      return a ? [{ userId: g.userId, name: g.name, kind: a.kind, note: a.note }] : [];
    }),
  }));
}

export interface ResumoDaUnidade {
  gerentesAtivos: number;
  /** Dias de folga no mês escolhido (soma de todos os gerentes da unidade). */
  folgasNoMes: number;
  /** Dias de folga na semana de hoje (segunda a domingo). */
  folgasNaSemana: number;
  /** Gerentes com pelo menos um dia de férias no mês escolhido. */
  gerentesDeFerias: number;
}

export function resumoDaUnidade(gerentes: GerenteCru[], year: number, month: number, hoje: string): ResumoDaUnidade {
  const mes = diasDoMes(year, month);
  const sem = semanaDe(hoje);
  const semana = diasEntre(sem.de, sem.ate);
  const conta = (dias: Dia[], k: TipoDeAusencia) =>
    gerentes.reduce((s, g) => s + dias.filter((d) => marcaNoDia(g, d.iso) === k).length, 0);
  return {
    gerentesAtivos: gerentes.length,
    folgasNoMes: conta(mes, 'FOLGA'),
    folgasNaSemana: conta(semana, 'FOLGA'),
    gerentesDeFerias: gerentes.filter((g) => mes.some((d) => marcaNoDia(g, d.iso) === 'FERIAS')).length,
  };
}

/**
 * Gerentes COM horário e sem nenhuma folga nos últimos 7 dias (hoje incluso) —
 * a regra do alerta ao supervisor (20/07), agora mostrada na unidade.
 */
export function semFolgaHa7Dias(gerentes: GerenteCru[], hoje: string): string[] {
  const de = somarDias(hoje, -7);
  return gerentes
    .filter((g) => g.weekdays.length > 0)
    .filter((g) => !g.ausencias.some((a) => a.kind === 'FOLGA' && a.endDate >= de && a.startDate <= hoje))
    .map((g) => g.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/* ─────────────────────────── a rede ─────────────────────────── */

export interface AusenciaNoPeriodo {
  userId: string;
  name: string;
  kind: TipoDeAusencia;
  /** Recortado ao período: férias de 20 dias numa semana aparecem só na semana. */
  de: string;
  ate: string;
}

/** As ausências de UMA unidade dentro do período, uma linha por lançamento. */
export function ausenciasNoPeriodo(gerentes: GerenteCru[], de: string, ate: string): AusenciaNoPeriodo[] {
  return gerentes
    .flatMap((g) => g.ausencias
      .filter((a) => a.startDate <= ate && a.endDate >= de)
      .map((a) => ({
        userId: g.userId,
        name: g.name,
        kind: a.kind,
        de: a.startDate < de ? de : a.startDate,
        ate: a.endDate > ate ? ate : a.endDate,
      })))
    .sort((a, b) => a.de.localeCompare(b.de) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** "Segunda 28/09" para um dia; "28/09 a 02/10" para um intervalo. */
export function textoDoIntervalo(de: string, ate: string): string {
  if (de === ate) return `${DIA_LONGO[diaDaSemana(de)]} ${ddmm(de)}`;
  return `${ddmm(de)} a ${ddmm(ate)}`;
}
