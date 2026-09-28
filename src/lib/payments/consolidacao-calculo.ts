import type { PaymentStatus } from '@prisma/client';

/**
 * CONSOLIDAÇÃO DE PAGAMENTOS — o núcleo PURO (v1.126.0).
 *
 * Freelancer + Hora Extra num só lugar, para conferir e mandar ao Financeiro.
 * É uma camada de CONSULTA sobre `payment_requests`: nada aqui grava, nada
 * muda status, e cada lançamento continua sendo UMA linha rastreável.
 *
 * Mora sem import de servidor porque a tela é componente cliente — e porque
 * tela, PDF e Excel têm de sair desta mesma conta, senão o arquivo que vai ao
 * Financeiro discorda da tela em que ele foi conferido.
 */

/* ───────────────────────── filtros ───────────────────────── */

export type PeriodoRapido = 'hoje' | 'ontem' | 'semana' | 'semana-passada' | 'mes' | 'mes-passado' | 'personalizado';
export type TipoCons = 'TODOS' | 'FREELANCER' | 'OVERTIME';
export type StatusCons = 'TODOS' | PaymentStatus;
export type Visao = 'lancamento' | 'colaborador';
export type Ordem = 'data' | 'unidade' | 'colaborador' | 'tipo' | 'status';

export const PERIODOS_RAPIDOS: { value: PeriodoRapido; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'semana-passada', label: 'Semana passada' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mes-passado', label: 'Mês passado' },
  { value: 'personalizado', label: 'Escolher período' },
];

export const TIPOS_CONS: { value: TipoCons; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'FREELANCER', label: 'Freelancer' },
  { value: 'OVERTIME', label: 'Hora Extra' },
];

/**
 * Os status que o SGO JÁ usa, com os mesmos nomes. O "a pagar" do pedido é o
 * Aprovado — é ele que está na aba Pagar esperando o pagamento; não existe um
 * status separado, e inventar um nome aqui faria a consolidação falar uma
 * língua e a aba Pagamentos outra.
 */
export const STATUS_CONS: { value: StatusCons; label: string; hint?: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'PENDING', label: 'Pendente', hint: 'aguardando aprovação' },
  { value: 'APPROVED', label: 'Aprovado', hint: 'a pagar (aba Pagar)' },
  { value: 'PAID', label: 'Pago' },
  { value: 'REJECTED', label: 'Rejeitado' },
];

export const STATUS_TEXTO: Record<PaymentStatus, string> = { PENDING: 'Pendente', APPROVED: 'Aprovado', PAID: 'Pago', REJECTED: 'Rejeitado' };
export const TIPO_TEXTO = { FREELANCER: 'Freelancer', OVERTIME: 'Hora Extra' } as const;

export interface FiltroConsolidacao {
  periodo: PeriodoRapido;
  de?: string;
  ate?: string;
  unitId?: string;
  tipo: TipoCons;
  status: StatusCons;
  /** Chave da pessoa (ver `chaveDaPessoa`) — vazio = todas. */
  pessoa?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const um = <T extends string>(v: string | undefined | null, validos: readonly T[], padrao: T): T =>
  (validos as readonly string[]).includes(v ?? '') ? (v as T) : padrao;

/**
 * Lê o filtro da URL. É a MESMA leitura na tela, no PDF e no Excel — é o que
 * garante que o arquivo sai "exatamente com os filtros aplicados".
 */
export function lerFiltro(sp: { get(k: string): string | null }): FiltroConsolidacao {
  const de = sp.get('de') ?? '';
  const ate = sp.get('ate') ?? '';
  return {
    periodo: um<PeriodoRapido>(sp.get('periodo'), PERIODOS_RAPIDOS.map((p) => p.value), 'semana'),
    de: ISO.test(de) ? de : undefined,
    ate: ISO.test(ate) ? ate : undefined,
    unitId: sp.get('unidade') || undefined,
    tipo: um<TipoCons>(sp.get('tipo'), ['TODOS', 'FREELANCER', 'OVERTIME'], 'TODOS'),
    status: um<StatusCons>(sp.get('status'), ['TODOS', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'], 'TODOS'),
    pessoa: sp.get('pessoa') || undefined,
  };
}

/** O inverso de `lerFiltro` — monta a query dos links de Excel e PDF. */
export function queryDoFiltro(f: FiltroConsolidacao): string {
  const p = new URLSearchParams();
  p.set('periodo', f.periodo);
  if (f.periodo === 'personalizado') {
    if (f.de) p.set('de', f.de);
    if (f.ate) p.set('ate', f.ate);
  }
  if (f.unitId) p.set('unidade', f.unitId);
  if (f.tipo !== 'TODOS') p.set('tipo', f.tipo);
  if (f.status !== 'TODOS') p.set('status', f.status);
  if (f.pessoa) p.set('pessoa', f.pessoa);
  return p.toString();
}

/* ───────────────────────── datas ───────────────────────── */

const d0 = (iso: string) => new Date(`${iso}T12:00:00Z`);
const isoDe = (d: Date) => d.toISOString().slice(0, 10);
export const somarDias = (iso: string, n: number) => { const d = d0(iso); d.setUTCDate(d.getUTCDate() + n); return isoDe(d); };
export const emBR = (iso: string) => iso.split('-').reverse().join('/');

/** Segunda→domingo, o mesmo corte do fechamento semanal e da recorrência. */
export function semanaDoDia(iso: string): { de: string; ate: string } {
  const dow = d0(iso).getUTCDay(); // 0 = domingo
  const de = somarDias(iso, -((dow + 6) % 7));
  return { de, ate: somarDias(de, 6) };
}

function mesDoDia(iso: string, deslocamento = 0): { de: string; ate: string } {
  const d = d0(iso);
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deslocamento, 1, 12));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + deslocamento + 1, 0, 12));
  return { de: isoDe(ini), ate: isoDe(fim) };
}

export interface PeriodoResolvido { de: string; ate: string; rotulo: string }

/**
 * A escolha do filtro em datas. `hoje` é o dia em Brasília e entra por
 * parâmetro — o servidor roda em UTC, e às 22h de domingo "esta semana" já
 * seria a próxima.
 */
export function resolverPeriodo(f: Pick<FiltroConsolidacao, 'periodo' | 'de' | 'ate'>, hoje: string): PeriodoResolvido {
  const rot = (de: string, ate: string) => (de === ate ? emBR(de) : `${emBR(de)} a ${emBR(ate)}`);
  const com = (x: { de: string; ate: string }) => ({ ...x, rotulo: rot(x.de, x.ate) });
  switch (f.periodo) {
    case 'hoje': return com({ de: hoje, ate: hoje });
    case 'ontem': { const o = somarDias(hoje, -1); return com({ de: o, ate: o }); }
    case 'semana': return com(semanaDoDia(hoje));
    case 'semana-passada': return com(semanaDoDia(somarDias(hoje, -7)));
    case 'mes': return com(mesDoDia(hoje));
    case 'mes-passado': return com(mesDoDia(hoje, -1));
    case 'personalizado': {
      /* Data faltando não vira "período vazio" calado: um dia só vale para os
         dois lados (1 dia é período legítimo), e nada escolhido cai na semana. */
      const de = f.de ?? f.ate;
      const ate = f.ate ?? f.de;
      if (!de || !ate) return com(semanaDoDia(hoje));
      return com(de <= ate ? { de, ate } : { de: ate, ate: de });
    }
  }
}

/* ───────────────────────── lançamentos ───────────────────────── */

export interface Lancamento {
  id: string;
  /** Dia do SERVIÇO (YYYY-MM-DD) — não o dia em que a solicitação foi criada. */
  data: string;
  unitId: string;
  unidade: string;
  tipo: 'FREELANCER' | 'OVERTIME';
  pessoaChave: string;
  pessoa: string;
  horas: number | null;
  vt: number;
  /** O valor da solicitação — o MESMO que a aba Pagar paga (já inclui o V.T. lançado). */
  valor: number;
  status: PaymentStatus;
  motivo: string | null;
  solicitadoPor: string | null;
  /** Dia em que a solicitação foi criada (YYYY-MM-DD, Brasília). */
  dataSolicitacao: string;
  /** Hora Extra lançada antes do vínculo com o RH: só o nome digitado. */
  semVinculoRh: boolean;
}

/**
 * Quem é a pessoa, para agrupar e filtrar. Freelancer pelo cadastro dele; HE
 * pelo colaborador do RH; HE antiga, sem vínculo, pelo nome digitado sem
 * acento e caixa — é o melhor que o dado permite, e a tela marca essas linhas.
 */
export function chaveDaPessoa(r: { tipo: 'FREELANCER' | 'OVERTIME'; freelancerId?: string | null; collaboratorId?: string | null; nome: string }): string {
  if (r.tipo === 'FREELANCER') return r.freelancerId ? `F:${r.freelancerId}` : `N:${norm(r.nome)}`;
  return r.collaboratorId ? `C:${r.collaboratorId}` : `N:${norm(r.nome)}`;
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Entra nos totais? Rejeitado NÃO soma — a menos que a pessoa tenha pedido
 * justamente os rejeitados, e aí somar é o que ela quer ver.
 */
export const entraNosTotais = (l: Pick<Lancamento, 'status'>, status: StatusCons) =>
  status === 'REJECTED' ? l.status === 'REJECTED' : l.status !== 'REJECTED';

/** Status e pessoa se aplicam sobre as linhas do período (unidade/tipo já vieram do banco). */
export function filtrarLancamentos(xs: Lancamento[], f: Pick<FiltroConsolidacao, 'status' | 'pessoa'>): Lancamento[] {
  return xs.filter((l) => (f.status === 'TODOS' || l.status === f.status) && (!f.pessoa || l.pessoaChave === f.pessoa));
}

/** As pessoas que aparecem no período — o seletor "Colaborador" não oferece quem não tem lançamento. */
export function pessoasDoPeriodo(xs: Lancamento[]): { value: string; label: string; hint: string }[] {
  const m = new Map<string, { label: string; tipos: Set<string> }>();
  for (const l of xs) {
    const p = m.get(l.pessoaChave) ?? { label: l.pessoa, tipos: new Set<string>() };
    p.tipos.add(TIPO_TEXTO[l.tipo]);
    m.set(l.pessoaChave, p);
  }
  return [...m.entries()]
    .map(([value, p]) => ({ value, label: p.label, hint: [...p.tipos].join(' · ') }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

const soma = (xs: number[]) => Math.round(xs.reduce((s, n) => s + n, 0) * 100) / 100;

export interface Resumo {
  solicitacoes: number;
  freelancers: number;
  horasExtras: number;
  /** Vale-transporte lançado — CONTIDO no total, não somado a ele. */
  vt: number;
  valorFreelancer: number;
  valorHoraExtra: number;
  total: number;
  /** Rejeitados que ficaram fora da conta (quando não se pediu por eles). */
  fora: { qtd: number; valor: number };
  /** Pendentes dentro do total — ainda não aprovados, o Financeiro não paga. */
  pendentes: { qtd: number; valor: number };
}

export function resumir(xs: Lancamento[], status: StatusCons): Resumo {
  const dentro = xs.filter((l) => entraNosTotais(l, status));
  const fora = xs.filter((l) => !entraNosTotais(l, status));
  const fl = dentro.filter((l) => l.tipo === 'FREELANCER');
  const he = dentro.filter((l) => l.tipo === 'OVERTIME');
  const pend = dentro.filter((l) => l.status === 'PENDING');
  return {
    solicitacoes: dentro.length,
    freelancers: fl.length,
    horasExtras: he.length,
    vt: soma(dentro.map((l) => l.vt)),
    valorFreelancer: soma(fl.map((l) => l.valor)),
    valorHoraExtra: soma(he.map((l) => l.valor)),
    total: soma(dentro.map((l) => l.valor)),
    fora: { qtd: fora.length, valor: soma(fora.map((l) => l.valor)) },
    pendentes: { qtd: pend.length, valor: soma(pend.map((l) => l.valor)) },
  };
}

export interface ResumoDaUnidade {
  unitId: string;
  unidade: string;
  freelancer: number;
  horaExtra: number;
  vt: number;
  total: number;
  lancamentos: Lancamento[];
}

/**
 * Por unidade — cada unidade no seu bloco, nunca misturada. `lancamentos` traz
 * TODAS as linhas da unidade (inclusive as que não somam), para o PDF listar
 * o que foi filtrado; os números só contam o que entra nos totais.
 */
export function porUnidade(xs: Lancamento[], status: StatusCons): ResumoDaUnidade[] {
  const m = new Map<string, ResumoDaUnidade>();
  for (const l of xs) {
    const u = m.get(l.unitId) ?? { unitId: l.unitId, unidade: l.unidade, freelancer: 0, horaExtra: 0, vt: 0, total: 0, lancamentos: [] };
    u.lancamentos.push(l);
    if (entraNosTotais(l, status)) {
      if (l.tipo === 'FREELANCER') u.freelancer += l.valor; else u.horaExtra += l.valor;
      u.vt += l.vt;
      u.total += l.valor;
    }
    m.set(l.unitId, u);
  }
  return [...m.values()]
    .map((u) => ({ ...u, freelancer: soma([u.freelancer]), horaExtra: soma([u.horaExtra]), vt: soma([u.vt]), total: soma([u.total]), lancamentos: ordenar(u.lancamentos, 'data', 'asc') }))
    .sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR'));
}

export interface ResumoDaPessoa {
  chave: string;
  pessoa: string;
  horaExtra: number;
  freelancer: number;
  vt: number;
  total: number;
  unidades: string[];
  /** Os lançamentos ORIGINAIS que compõem o total — um por linha, nada fundido. */
  lancamentos: Lancamento[];
}

export function porColaborador(xs: Lancamento[], status: StatusCons): ResumoDaPessoa[] {
  const m = new Map<string, ResumoDaPessoa>();
  for (const l of xs) {
    const p = m.get(l.pessoaChave) ?? { chave: l.pessoaChave, pessoa: l.pessoa, horaExtra: 0, freelancer: 0, vt: 0, total: 0, unidades: [], lancamentos: [] };
    p.lancamentos.push(l);
    if (!p.unidades.includes(l.unidade)) p.unidades.push(l.unidade);
    if (entraNosTotais(l, status)) {
      if (l.tipo === 'FREELANCER') p.freelancer += l.valor; else p.horaExtra += l.valor;
      p.vt += l.vt;
      p.total += l.valor;
    }
    m.set(l.pessoaChave, p);
  }
  return [...m.values()]
    .map((p) => ({ ...p, horaExtra: soma([p.horaExtra]), freelancer: soma([p.freelancer]), vt: soma([p.vt]), total: soma([p.total]), lancamentos: ordenar(p.lancamentos, 'data', 'asc') }))
    .sort((a, b) => a.pessoa.localeCompare(b.pessoa, 'pt-BR'));
}

const ORDEM_STATUS: Record<PaymentStatus, number> = { PENDING: 0, APPROVED: 1, PAID: 2, REJECTED: 3 };

/** Ordena sem perder a estabilidade: empate cai na data e depois no id. */
export function ordenar(xs: Lancamento[], ordem: Ordem, dir: 'asc' | 'desc'): Lancamento[] {
  const s = dir === 'asc' ? 1 : -1;
  const pt = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
  const chave = (a: Lancamento, b: Lancamento): number => {
    switch (ordem) {
      case 'unidade': return pt(a.unidade, b.unidade);
      case 'colaborador': return pt(a.pessoa, b.pessoa);
      case 'tipo': return pt(TIPO_TEXTO[a.tipo], TIPO_TEXTO[b.tipo]);
      case 'status': return ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status];
      default: return a.data.localeCompare(b.data);
    }
  };
  return [...xs].sort((a, b) => s * chave(a, b) || a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

/** "2h", "1,5h" ou "–". */
export const textoHoras = (h: number | null) => (h == null ? '–' : `${String(Math.round(h * 100) / 100).replace('.', ',')}h`);

/** O que a tela, o PDF e o Excel recebem — montado no servidor por `getConsolidacaoPagamentos`. */
export interface Consolidacao {
  periodo: PeriodoResolvido;
  unidades: { id: string; name: string }[];
  /** As linhas já filtradas (status e pessoa inclusos). */
  lancamentos: Lancamento[];
  /** Quem aparece no período (antes do filtro de pessoa) — opções do seletor. */
  pessoas: { value: string; label: string; hint: string }[];
  resumo: Resumo;
  porUnidade: ResumoDaUnidade[];
  porColaborador: ResumoDaPessoa[];
}
