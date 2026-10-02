import type { PaymentStatus } from '@prisma/client';
import { competenciaDaHoraExtra, rotuloDaCompetencia, somarMeses } from '@/lib/people/pagamento-extra-calculo';

/**
 * HORA EXTRA — o painel, a lista e o arquivo, sem banco (v1.142.0).
 *
 * Tudo que a tela "Hora extra" mostra sai de `payment_requests` do tipo
 * OVERTIME — a MESMA linha que Pagamentos aprova e que o Fechamento paga.
 * Este arquivo é puro de propósito: KPIs, comparativo por motivo, evolução
 * mensal e as duas folhas do Excel (Analítico e Sintético) têm de sair da mesma
 * conta, senão o arquivo conferido contra a tela discorda dela.
 *
 * O que NÃO mora aqui: regra de valor (`overtime/calculo.ts`), regra de
 * aprovação (`payments/approve.ts` — a HE continua sendo aprovada em
 * Pagamentos; esta tela não aprova nem reprova), competência
 * (`pagamento-extra-calculo.ts`).
 */

/* ───────────────────────── filtro ───────────────────────── */

export type PeriodoHE = 'mes' | '3m' | '6m' | 'ano' | 'personalizado';
export type StatusHE = 'TODOS' | PaymentStatus;
export type AbaHE = 'dashboard' | 'solicitacoes' | 'fechamento';

export const PERIODOS_HE: { value: PeriodoHE; label: string }[] = [
  { value: 'mes', label: 'Mês atual' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: 'ano', label: 'Ano atual' },
  { value: 'personalizado', label: 'Escolher período' },
];

export const STATUS_HE: { value: StatusHE; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'APPROVED', label: 'Aprovada (a pagar)' },
  { value: 'PAID', label: 'Paga' },
  { value: 'REJECTED', label: 'Reprovada' },
];

export const STATUS_TEXTO: Record<PaymentStatus, string> = { PENDING: 'Pendente', APPROVED: 'Aprovada', PAID: 'Paga', REJECTED: 'Reprovada' };

/** Rótulo do motivo quando a solicitação não aponta para o catálogo. */
export const MOTIVO_OUTRO = 'Outro';
/** Valor do filtro de motivo que seleciona as HE SEM motivo do catálogo. */
export const FILTRO_OUTRO = 'outro';

export interface FiltroHE {
  aba: AbaHE;
  periodo: PeriodoHE;
  de?: string;
  ate?: string;
  unitId?: string;
  status: StatusHE;
  /** '' = todos · 'outro' = sem motivo do catálogo · id do catálogo. */
  motivo: string;
  q: string;
  /** Competência do Fechamento ('AAAA-MM'). */
  mes?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;
const um = <T extends string>(v: string | undefined | null, validos: readonly T[], padrao: T): T =>
  (validos as readonly string[]).includes(v ?? '') ? (v as T) : padrao;

/** UMA leitura para tela, Excel e links — o arquivo sai com o filtro da tela. */
export function lerFiltroHE(sp: { get(k: string): string | null }): FiltroHE {
  const de = sp.get('de') ?? '';
  const ate = sp.get('ate') ?? '';
  const mes = sp.get('mes') ?? '';
  return {
    aba: um<AbaHE>(sp.get('aba'), ['dashboard', 'solicitacoes', 'fechamento'], 'dashboard'),
    periodo: um<PeriodoHE>(sp.get('periodo'), PERIODOS_HE.map((p) => p.value), 'mes'),
    de: ISO.test(de) ? de : undefined,
    ate: ISO.test(ate) ? ate : undefined,
    unitId: sp.get('unidade') || undefined,
    status: um<StatusHE>(sp.get('status'), ['TODOS', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'], 'TODOS'),
    motivo: (sp.get('motivo') ?? '').trim().slice(0, 40),
    q: (sp.get('q') ?? '').trim().slice(0, 80),
    mes: MES.test(mes) ? mes : undefined,
  };
}

export function queryDoFiltroHE(f: Partial<FiltroHE>): string {
  const p = new URLSearchParams();
  if (f.aba && f.aba !== 'dashboard') p.set('aba', f.aba);
  if (f.periodo && f.periodo !== 'mes') p.set('periodo', f.periodo);
  if (f.periodo === 'personalizado') {
    if (f.de) p.set('de', f.de);
    if (f.ate) p.set('ate', f.ate);
  }
  if (f.unitId) p.set('unidade', f.unitId);
  if (f.status && f.status !== 'TODOS') p.set('status', f.status);
  if (f.motivo) p.set('motivo', f.motivo);
  if (f.q) p.set('q', f.q);
  if (f.mes) p.set('mes', f.mes);
  return p.toString();
}

/* ───────────────────────── período ───────────────────────── */

export interface Periodo { de: string; ate: string; rotulo: string }

export function fimDoMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
const emBR = (iso: string) => iso.split('-').reverse().join('/');

/**
 * "Mês atual" vai do dia 1 ao ÚLTIMO dia do mês (não até hoje): a hora extra
 * é lançada pelo dia trabalhado e o painel do mês precisa continuar o mesmo
 * conforme os dias passam. "Últimos N meses" começa no dia 1 de N−1 meses
 * atrás — é como as pessoas leem, não uma janela de 90 dias que corta um mês
 * no meio (mesma decisão do relatório de gás, v1.113.0).
 */
export function resolverPeriodoHE(f: Pick<FiltroHE, 'periodo' | 'de' | 'ate'>, hoje: string): Periodo {
  const mes = hoje.slice(0, 7);
  const rotuloFaixa = (ini: string) => `${rotuloDaCompetencia(ini)} a ${rotuloDaCompetencia(mes)}`;
  switch (f.periodo) {
    case '3m': { const ini = somarMeses(mes, -2); return { de: `${ini}-01`, ate: fimDoMes(mes), rotulo: rotuloFaixa(ini) }; }
    case '6m': { const ini = somarMeses(mes, -5); return { de: `${ini}-01`, ate: fimDoMes(mes), rotulo: rotuloFaixa(ini) }; }
    case 'ano': { const y = hoje.slice(0, 4); return { de: `${y}-01-01`, ate: `${y}-12-31`, rotulo: `ano de ${y}` }; }
    case 'personalizado': {
      const de = f.de ?? `${mes}-01`;
      const candidato = f.ate ?? fimDoMes(mes);
      const ate = candidato >= de ? candidato : de;
      return { de, ate, rotulo: `${emBR(de)} a ${emBR(ate)}` };
    }
    default: return { de: `${mes}-01`, ate: fimDoMes(mes), rotulo: rotuloDaCompetencia(mes) };
  }
}

/** Os meses 'AAAA-MM' cobertos pelo período, em ordem. */
export function mesesDoPeriodo(p: Pick<Periodo, 'de' | 'ate'>): string[] {
  const out: string[] = [];
  let m = p.de.slice(0, 7);
  const fim = p.ate.slice(0, 7);
  while (m <= fim && out.length < 60) { out.push(m); m = somarMeses(m, 1); }
  return out;
}

/* ───────────────────────── a hora extra ───────────────────────── */

export interface HoraExtra {
  id: string;
  unitId: string;
  unidade: string;
  collaboratorId: string | null;
  /** Nome do CADASTRO quando vinculada; senão o nome congelado na solicitação. */
  colaborador: string;
  /** Matrícula do RH (`Collaborator.externalId`) — só com vínculo. */
  matricula: string | null;
  cpf: string | null;
  /** Dia trabalhado ('AAAA-MM-DD'), com a queda dia do serviço → data efetiva → criação. */
  dia: string;
  inicio: string | null;
  fim: string | null;
  horas: number | null;
  valorHora: number | null;
  vt: number;
  valor: number;
  motivoId: string | null;
  /** Nome do motivo do catálogo, ou "Outro". */
  motivo: string;
  /** O texto livre (detalhe, ou o motivo digitado nas HE antigas). */
  detalhe: string | null;
  status: PaymentStatus;
  solicitante: string | null;
  aprovador: string | null;
  motivoReprovacao: string | null;
  criadoEm: string;
}

/** Sem vínculo com o RH: não tem matrícula nem CPF, e agrupa pelo nome. */
export const semVinculoRh = (h: Pick<HoraExtra, 'collaboratorId'>) => !h.collaboratorId;

const centavos = (n: number) => Math.round(n * 100) / 100;
const conta = (h: HoraExtra) => h.status !== 'REJECTED';

/* ───────────────────────── KPIs ───────────────────────── */

export interface ResumoHE {
  /** Σ valor das não reprovadas (pendente + aprovada + paga). */
  valorTotal: number;
  totalPago: number;
  aPagar: number;
  horas: number;
  solicitacoes: number;
  reprovadas: number;
  mediaPorSolicitacao: number | null;
  valorPorHora: number | null;
  pendentes: { qtd: number; valor: number };
  colaboradores: number;
  semVinculo: number;
}

export function resumirHE(hes: HoraExtra[]): ResumoHE {
  const validas = hes.filter(conta);
  const valorTotal = centavos(validas.reduce((s, h) => s + h.valor, 0));
  const horas = centavos(validas.reduce((s, h) => s + (h.horas ?? 0), 0));
  const pend = validas.filter((h) => h.status === 'PENDING');
  const pessoas = new Set(validas.map(chaveDaPessoa));
  return {
    valorTotal,
    totalPago: centavos(validas.filter((h) => h.status === 'PAID').reduce((s, h) => s + h.valor, 0)),
    aPagar: centavos(validas.filter((h) => h.status === 'APPROVED').reduce((s, h) => s + h.valor, 0)),
    horas,
    solicitacoes: validas.length,
    reprovadas: hes.length - validas.length,
    mediaPorSolicitacao: validas.length ? centavos(valorTotal / validas.length) : null,
    valorPorHora: horas > 0 ? centavos(valorTotal / horas) : null,
    pendentes: { qtd: pend.length, valor: centavos(pend.reduce((s, h) => s + h.valor, 0)) },
    colaboradores: pessoas.size,
    semVinculo: validas.filter(semVinculoRh).length,
  };
}

/** Id do cadastro quando há vínculo; senão o nome normalizado — é o que ainda duplica a pessoa. */
export function chaveDaPessoa(h: Pick<HoraExtra, 'collaboratorId' | 'colaborador'>): string {
  return h.collaboratorId ? `id:${h.collaboratorId}` : `nome:${normalizarNome(h.colaborador)}`;
}

export interface FatiaDeMotivo { motivoId: string | null; motivo: string; qtd: number; horas: number; valor: number; pct: number }

/** Comparativo por MOTIVO (não reprovadas), do maior valor para o menor. */
export function porMotivo(hes: HoraExtra[]): FatiaDeMotivo[] {
  const por = new Map<string, FatiaDeMotivo>();
  for (const h of hes.filter(conta)) {
    const k = h.motivoId ?? FILTRO_OUTRO;
    const g = por.get(k) ?? { motivoId: h.motivoId, motivo: h.motivo, qtd: 0, horas: 0, valor: 0, pct: 0 };
    g.qtd += 1; g.horas = centavos(g.horas + (h.horas ?? 0)); g.valor = centavos(g.valor + h.valor);
    por.set(k, g);
  }
  const total = [...por.values()].reduce((s, g) => s + g.valor, 0);
  return [...por.values()]
    .map((g) => ({ ...g, pct: total > 0 ? Math.round((g.valor / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.valor - a.valor || a.motivo.localeCompare(b.motivo, 'pt-BR'));
}

export interface FatiaDeStatus { status: PaymentStatus; rotulo: string; qtd: number; valor: number; pct: number }

/** Status das solicitações — TODAS, inclusive reprovadas (é o que a fila mostra). */
export function porStatus(hes: HoraExtra[]): FatiaDeStatus[] {
  const ordem: PaymentStatus[] = ['APPROVED', 'PAID', 'PENDING', 'REJECTED'];
  const total = hes.length;
  return ordem.map((status) => {
    const xs = hes.filter((h) => h.status === status);
    return { status, rotulo: STATUS_TEXTO[status], qtd: xs.length, valor: centavos(xs.reduce((s, h) => s + h.valor, 0)), pct: total ? Math.round((xs.length / total) * 1000) / 10 : 0 };
  });
}

export interface MesDaEvolucao { mes: string; rotulo: string; qtd: number; horas: number; valor: number }

/** Evolução mensal pelo DIA TRABALHADO, um ponto por mês do período (mês sem HE = zero, não buraco). */
export function evolucaoMensal(hes: HoraExtra[], meses: string[]): MesDaEvolucao[] {
  const por = new Map(meses.map((m) => [m, { mes: m, rotulo: rotuloCurto(m), qtd: 0, horas: 0, valor: 0 }]));
  for (const h of hes.filter(conta)) {
    const g = por.get(h.dia.slice(0, 7));
    if (!g) continue;
    g.qtd += 1; g.horas = centavos(g.horas + (h.horas ?? 0)); g.valor = centavos(g.valor + h.valor);
  }
  return [...por.values()];
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function rotuloCurto(mes: string): string {
  if (!MES.test(mes)) return mes;
  const [y, m] = mes.split('-');
  return `${MESES_CURTOS[Number(m) - 1]}/${y.slice(2)}`;
}

/* ───────────────────────── busca e ordenação ───────────────────────── */

export function normalizarNome(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Busca por colaborador, unidade, motivo, detalhe ou matrícula — sem acento, sem caixa. */
export function buscar(hes: HoraExtra[], q: string): HoraExtra[] {
  const t = normalizarNome(q);
  if (!t) return hes;
  return hes.filter((h) => normalizarNome(`${h.colaborador} ${h.unidade} ${h.motivo} ${h.detalhe ?? ''} ${h.matricula ?? ''}`).includes(t));
}

export type OrdemHE = 'data' | 'colaborador' | 'unidade' | 'valor' | 'status';

export function ordenarHE(hes: HoraExtra[], ordem: OrdemHE): HoraExtra[] {
  const xs = [...hes];
  const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
  switch (ordem) {
    case 'colaborador': return xs.sort((a, b) => porNome(a.colaborador, b.colaborador) || b.dia.localeCompare(a.dia));
    case 'unidade': return xs.sort((a, b) => porNome(a.unidade, b.unidade) || b.dia.localeCompare(a.dia));
    case 'valor': return xs.sort((a, b) => b.valor - a.valor || b.dia.localeCompare(a.dia));
    case 'status': { const o: Record<PaymentStatus, number> = { PENDING: 0, APPROVED: 1, PAID: 2, REJECTED: 3 }; return xs.sort((a, b) => o[a.status] - o[b.status] || b.dia.localeCompare(a.dia)); }
    default: return xs.sort((a, b) => b.dia.localeCompare(a.dia) || b.criadoEm.localeCompare(a.criadoEm));
  }
}

/* ───────────────────────── vínculo com o RH ───────────────────────── */

export interface CandidatoRh { id: string; name: string; jobTitle?: string | null }

/**
 * Quem, no cadastro da unidade, é a pessoa de uma HE antiga (só com nome)?
 * EXATOS = nome normalizado igual (é o único caso em que o sistema vincula
 * sozinho, e só quando há UM); PARECIDOS = todos os tokens do nome digitado
 * aparecem no cadastro ("Vera Lucia" acha "Vera Lúcia dos Anjos") — sugestão
 * para o Admin escolher, nunca automático.
 */
export function candidatosDeVinculo(nome: string, colaboradores: CandidatoRh[]): { exatos: CandidatoRh[]; parecidos: CandidatoRh[] } {
  const alvo = normalizarNome(nome);
  if (!alvo) return { exatos: [], parecidos: [] };
  const tokens = alvo.split(' ').filter((t) => t.length > 1);
  const exatos = colaboradores.filter((c) => normalizarNome(c.name) === alvo);
  const parecidos = colaboradores.filter((c) => {
    const n = normalizarNome(c.name);
    if (n === alvo) return false;
    const nt = new Set(n.split(' '));
    return tokens.length > 0 && tokens.every((t) => nt.has(t));
  });
  return { exatos, parecidos };
}

/* ───────────────────────── o arquivo (Analítico + Sintético) ───────────────────────── */

export const COLUNAS_ANALITICO = [
  'ID', 'Matrícula', 'CPF', 'Colaborador', 'Unidade', 'Data', 'Início', 'Fim', 'Horas', 'Valor/hora', 'Vale transporte', 'Valor',
  'Motivo', 'Detalhe', 'Status', 'Solicitante', 'Aprovador', 'Competência', 'Vínculo RH',
] as const;

export const COLUNAS_SINTETICO = ['Matrícula', 'CPF', 'Colaborador', 'Unidade(s)', 'Qtd. horas extras', 'Horas', 'Valor total', 'Pago', 'A pagar', 'Pendente', 'Vínculo RH'] as const;

export type LinhaDoArquivo = (string | number)[];

export const cpfBr = (cpf: string | null | undefined) => {
  const d = (cpf ?? '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
};
export const dataBr = (iso: string) => (ISO.test(iso) ? emBR(iso) : '');

/** Uma linha por hora extra, na ordem recebida (quem exporta já ordenou). Inclui reprovadas, com o status dizendo. */
export function linhasAnalitico(hes: HoraExtra[]): LinhaDoArquivo[] {
  return [
    [...COLUNAS_ANALITICO],
    ...hes.map((h, i) => [
      i + 1,
      h.matricula ?? '',
      cpfBr(h.cpf),
      h.colaborador,
      h.unidade,
      dataBr(h.dia),
      h.inicio ?? '',
      h.fim ?? '',
      h.horas ?? '',
      h.valorHora ?? '',
      h.vt,
      h.valor,
      h.motivo,
      h.detalhe ?? '',
      STATUS_TEXTO[h.status],
      h.solicitante ?? '',
      h.aprovador ?? '',
      competenciaDaHoraExtra(h.dia) ?? '',
      h.collaboratorId ? 'Sim' : 'Não',
    ]),
  ];
}

export interface LinhaSintetica {
  chave: string;
  collaboratorId: string | null;
  matricula: string | null;
  cpf: string | null;
  colaborador: string;
  unidades: string[];
  qtd: number;
  horas: number;
  valor: number;
  pago: number;
  aPagar: number;
  pendente: number;
}

/**
 * Uma linha por PESSOA (não por unidade): a pergunta do sintético é "quanto a
 * Vera fez no período", e a Vera é uma só — a(s) unidade(s) vão numa coluna.
 * Reprovada não entra (não é pagamento). Com vínculo, a chave é o cadastro; sem
 * vínculo, o nome normalizado — e é isso que ainda pode duplicar alguém grafado
 * de dois jeitos: a coluna "Vínculo RH" aponta exatamente essas linhas.
 */
export function sintetico(hes: HoraExtra[]): LinhaSintetica[] {
  const por = new Map<string, LinhaSintetica>();
  for (const h of hes.filter(conta)) {
    const chave = chaveDaPessoa(h);
    const g = por.get(chave) ?? { chave, collaboratorId: h.collaboratorId, matricula: h.matricula, cpf: h.cpf, colaborador: h.colaborador, unidades: [], qtd: 0, horas: 0, valor: 0, pago: 0, aPagar: 0, pendente: 0 };
    if (!g.unidades.includes(h.unidade)) g.unidades.push(h.unidade);
    g.qtd += 1; g.horas = centavos(g.horas + (h.horas ?? 0)); g.valor = centavos(g.valor + h.valor);
    if (h.status === 'PAID') g.pago = centavos(g.pago + h.valor);
    if (h.status === 'APPROVED') g.aPagar = centavos(g.aPagar + h.valor);
    if (h.status === 'PENDING') g.pendente = centavos(g.pendente + h.valor);
    por.set(chave, g);
  }
  return [...por.values()].sort((a, b) => a.colaborador.localeCompare(b.colaborador, 'pt-BR'));
}

export function linhasSintetico(hes: HoraExtra[]): LinhaDoArquivo[] {
  const linhas = sintetico(hes);
  const total = linhas.reduce(
    (s, l) => ({ qtd: s.qtd + l.qtd, horas: centavos(s.horas + l.horas), valor: centavos(s.valor + l.valor), pago: centavos(s.pago + l.pago), aPagar: centavos(s.aPagar + l.aPagar), pendente: centavos(s.pendente + l.pendente) }),
    { qtd: 0, horas: 0, valor: 0, pago: 0, aPagar: 0, pendente: 0 },
  );
  const corpo: LinhaDoArquivo[] = linhas.map((l) => [l.matricula ?? '', cpfBr(l.cpf), l.colaborador, l.unidades.join(' / '), l.qtd, l.horas, l.valor, l.pago, l.aPagar, l.pendente, l.collaboratorId ? 'Sim' : 'Não']);
  const rodape: LinhaDoArquivo[] = linhas.length ? [['', '', 'TOTAL', '', total.qtd, total.horas, total.valor, total.pago, total.aPagar, total.pendente, '']] : [];
  return [[...COLUNAS_SINTETICO], ...corpo, ...rodape];
}
