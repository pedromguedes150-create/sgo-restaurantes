/**
 * CENTRAL DE CURRÍCULOS — regras PURAS (v1.212.0).
 *
 * O gerente encaminha (nome, telefone, cargo, arquivo) e ACOMPANHA. Quem
 * analisa e muda a situação é o RH, no sistema do RH: o SGO grava RECEBIDO ao
 * encaminhar e só muda quando chega o evento `curriculo-situacao` pela mesma
 * porta de entrada dos atestados. Nada aqui simula resposta do RH.
 */

export const STATUS_DO_CURRICULO = [
  'RECEBIDO', 'EM_ANALISE', 'PRIMEIRA_ETAPA', 'ENTREVISTA_AGENDADA', 'AVALIACAO_FINAL',
  'APROVADO', 'REPROVADO', 'BANCO_DE_TALENTOS', 'DESISTENCIA', 'CONTRATADO',
] as const;
export type StatusDoCurriculo = (typeof STATUS_DO_CURRICULO)[number];

export type TomDoStatus = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const STATUS_LABEL: Record<StatusDoCurriculo, string> = {
  RECEBIDO: 'Recebido',
  EM_ANALISE: 'Em análise',
  PRIMEIRA_ETAPA: '1ª etapa concluída',
  ENTREVISTA_AGENDADA: 'Entrevista agendada',
  AVALIACAO_FINAL: 'Em avaliação final',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  BANCO_DE_TALENTOS: 'Banco de talentos',
  DESISTENCIA: 'Desistência',
  CONTRATADO: 'Contratado',
};

export const STATUS_TOM: Record<StatusDoCurriculo, TomDoStatus> = {
  RECEBIDO: 'neutral',
  EM_ANALISE: 'info',
  PRIMEIRA_ETAPA: 'info',
  ENTREVISTA_AGENDADA: 'warning',
  AVALIACAO_FINAL: 'info',
  APROVADO: 'success',
  REPROVADO: 'danger',
  BANCO_DE_TALENTOS: 'neutral',
  DESISTENCIA: 'neutral',
  CONTRATADO: 'brand',
};

/** A grafia que o RH manda no evento → a situação do SGO. Lista FECHADA. */
export const SITUACOES_DO_RH: Record<string, StatusDoCurriculo> = {
  recebido: 'RECEBIDO',
  em_analise: 'EM_ANALISE',
  primeira_etapa_concluida: 'PRIMEIRA_ETAPA',
  entrevista_agendada: 'ENTREVISTA_AGENDADA',
  em_avaliacao_final: 'AVALIACAO_FINAL',
  aprovado: 'APROVADO',
  reprovado: 'REPROVADO',
  banco_de_talentos: 'BANCO_DE_TALENTOS',
  desistencia: 'DESISTENCIA',
  contratado: 'CONTRATADO',
};
export const SITUACAO_NO_RH = Object.fromEntries(Object.entries(SITUACOES_DO_RH).map(([k, v]) => [v, k])) as Record<StatusDoCurriculo, string>;

/* ───────────────────────── faixas dos indicadores ───────────────────────── */

export const FAIXAS = ['todos', 'analise', 'entrevista', 'aprovado', 'contratado', 'encerrado'] as const;
export type Faixa = (typeof FAIXAS)[number];

const DA_FAIXA: Record<Exclude<Faixa, 'todos'>, readonly StatusDoCurriculo[]> = {
  analise: ['RECEBIDO', 'EM_ANALISE', 'PRIMEIRA_ETAPA', 'AVALIACAO_FINAL'],
  entrevista: ['ENTREVISTA_AGENDADA'],
  aprovado: ['APROVADO'],
  contratado: ['CONTRATADO'],
  encerrado: ['REPROVADO', 'BANCO_DE_TALENTOS', 'DESISTENCIA'],
};
export const FAIXA_LABEL: Record<Faixa, string> = {
  todos: 'Todos', analise: 'Em análise', entrevista: 'Entrevistas', aprovado: 'Aprovados', contratado: 'Contratados', encerrado: 'Encerrados',
};
export const faixaValida = (v: unknown): Faixa => (FAIXAS as readonly string[]).includes(String(v)) ? (v as Faixa) : 'todos';
export const statusDaFaixa = (f: Faixa): readonly StatusDoCurriculo[] | null => (f === 'todos' ? null : DA_FAIXA[f]);

export interface Indicadores { recebidos: number; analise: number; entrevista: number; aprovado: number; contratado: number; encerrado: number }

/** Os números do topo. "Recebidos" é TUDO que a unidade encaminhou no recorte. */
export function indicadores(porStatus: Partial<Record<StatusDoCurriculo, number>>): Indicadores {
  const soma = (xs: readonly StatusDoCurriculo[]) => xs.reduce((t, s) => t + (porStatus[s] ?? 0), 0);
  return {
    recebidos: soma(STATUS_DO_CURRICULO),
    analise: soma(DA_FAIXA.analise),
    entrevista: soma(DA_FAIXA.entrevista),
    aprovado: soma(DA_FAIXA.aprovado),
    contratado: soma(DA_FAIXA.contratado),
    encerrado: soma(DA_FAIXA.encerrado),
  };
}

/* ───────────────────────── o encaminhamento ───────────────────────── */

export const NOME_MIN = 5;
export const NOME_MAX = 120;
export const OBS_MAX = 300;
export const CARGO_MAX = 60;

export const CARGOS_PADRAO = [
  'Auxiliar de Cozinha', 'Cozinheiro', 'Churrasqueiro', 'Garçom / Garçonete', 'Caixa',
  'Atendente', 'Auxiliar de Limpeza', 'Outro',
] as const;

/** Só os dígitos. Aceita 10 (fixo) ou 11 (celular) com DDD; um "55" na frente sai. */
export function normalizarTelefone(v: unknown): string | null {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d[0] === '0') return null;
  return d;
}

export function telefoneFormatado(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** Nome e sobrenome, sem número. Devolve o nome arrumado ou null. */
export function normalizarNome(v: unknown): string | null {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, NOME_MAX);
  if (s.length < NOME_MIN || /\d/.test(s) || s.split(' ').length < 2) return null;
  return s;
}

/* ───────────────────────── o arquivo ───────────────────────── */

export const ARQUIVO_MAX_BYTES = 15 * 1024 * 1024;
export type TipoDeArquivo = 'pdf' | 'jpg' | 'png';
export const MIME_DO_TIPO: Record<TipoDeArquivo, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' };

/**
 * O tipo sai do CONTEÚDO (os primeiros bytes), não do nome nem do MIME que o
 * navegador declara: um ".pdf" que não é PDF não entra.
 */
export function tipoPeloConteudo(b: Uint8Array): TipoDeArquivo | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  return null;
}

/* ───────────────────────── o retorno do RH ───────────────────────── */

export interface RetornoDoRh {
  sgoCurriculoId: string | null;
  rhCandidatoId: string | null;
  situacao: string;
  status: StatusDoCurriculo;
  observacao: string | null;
  entrevistaEm: Date | null;
}
export type ValidacaoDoRetorno = { ok: true; dados: RetornoDoRh } | { ok: false; erro: string };

const texto = (v: unknown, max: number) => { const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''; return s ? s.slice(0, max) : null; };

/** Confere o corpo do evento `curriculo-situacao`. Nada é adivinhado: situação fora da lista é erro. */
export function validarRetornoDoRh(p: Record<string, unknown>): ValidacaoDoRetorno {
  const sgoCurriculoId = texto(p.sgoCurriculoId ?? p.sgo_curriculo_id, 64);
  const rhCandidatoId = texto(p.rhCandidatoId ?? p.rh_candidato_id, 64);
  if (!sgoCurriculoId && !rhCandidatoId) return { ok: false, erro: 'Informe sgoCurriculoId (o id do currículo no SGO) ou rhCandidatoId.' };
  const situacao = String(p.situacao ?? '').trim().toLowerCase();
  const status = SITUACOES_DO_RH[situacao];
  if (!status) return { ok: false, erro: `Situação desconhecida: "${situacao}". Use uma de: ${Object.keys(SITUACOES_DO_RH).join(', ')}.` };
  let entrevistaEm: Date | null = null;
  const bruto = p.entrevistaEm ?? p.entrevista_em;
  if (bruto != null && bruto !== '') {
    const d = new Date(String(bruto));
    if (Number.isNaN(d.getTime())) return { ok: false, erro: 'entrevistaEm inválida: use data e hora em ISO 8601 (ex.: 2026-11-25T14:00:00-03:00).' };
    entrevistaEm = d;
  }
  return { ok: true, dados: { sgoCurriculoId, rhCandidatoId, situacao, status, observacao: texto(p.observacao, 500), entrevistaEm } };
}

/** O mesmo evento chegando de novo (o RH repete em caso de dúvida): não gera histórico nem aviso. */
export function ehRepeticao(atual: { status: StatusDoCurriculo; statusNote: string | null; interviewAt: Date | null }, r: RetornoDoRh): boolean {
  return atual.status === r.status && (atual.statusNote ?? null) === (r.observacao ?? null)
    && (atual.interviewAt?.getTime() ?? null) === (r.entrevistaEm?.getTime() ?? null);
}

const dataHoraBR = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function mensagemParaOGerente(candidato: string, r: RetornoDoRh): { title: string; body: string; importante: boolean } {
  const partes = [`${candidato}: ${STATUS_LABEL[r.status]}`];
  if (r.entrevistaEm) partes.push(`entrevista em ${dataHoraBR(r.entrevistaEm)}`);
  if (r.observacao) partes.push(r.observacao);
  return {
    title: `Currículo — ${STATUS_LABEL[r.status]}`,
    body: partes.join(' · '),
    importante: r.status === 'ENTREVISTA_AGENDADA' || r.status === 'APROVADO' || r.status === 'CONTRATADO',
  };
}
