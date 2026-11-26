import { codigoDaVaga, contemCpf, sgoCurriculoId, sgoVagaId, SISTEMA } from '@/lib/vagas/regras';
import { SITUACOES_DA_VAGA_NO_RH, type SituacaoDaVagaNoRh } from '@/lib/vagas/acompanhamento';
import { LISTA_DAS_SITUACOES, situacaoDoRh, type SituacaoDoRh } from '@/lib/vagas/curriculo-situacao';

/**
 * O CONTRATO COM O RH (gbf-rh) — PURO. O MESMO do SGO dos postos, para o RH ter
 * UM processo de vagas para o grupo. O Restaurante só muda os identificadores
 * (`rest-vaga-`, `rest-cv-`, `VAGR-`) e se identifica em `sistema`.
 *
 *  Rota 1 (SGO → RH): POST /api/integracoes/sgo/vagas — ação criar · cancelar · atualizar · curriculo
 *  Rota 2 (RH → SGO): POST /api/integracoes/rh/vaga-situacao
 *  Rota 3 (RH → SGO): POST /api/integracoes/rh/curriculo-situacao
 */

export const ROTA_DO_RH = '/api/integracoes/sgo/vagas';
export const TIMEOUT_DO_ENVIO_MS = 60_000;

/* ───────────────────────── Rota 1: o que vai ───────────────────────── */

export interface VagaParaEnviar {
  number: number;
  unidade: { id: string; nome: string; cnpj: string | null; razaoSocial: string | null; endereco: string | null };
  quantidade: number;
  posicoes: { ordem: number; cargo: string; motivo: string; substituiNome: string | null; substituiCpf: string | null; escala: string; horario: string; requisitos: string | null; observacao: string | null; inicioDesejado: string }[];
  requisitos: string | null;
  inicioDesejado: string;
  prioridade: string;
  observacao: string | null;
  solicitante: { nome: string; email: string | null };
  solicitadoEm: string;
  aprovacao: { nome: string; email: string | null; aprovadoEm: string } | null;
  codigoRh: string | null;
}
export interface CurriculoParaEnviar { number: number; nomeArquivo: string; contentType: string; indicadoPor: string | null; conteudoBase64: string }

const digitos = (v: string | null | undefined) => { const d = (v ?? '').replace(/\D/g, ''); return d || null; };

function base(v: VagaParaEnviar, acao: 'criar' | 'cancelar' | 'atualizar') {
  return {
    sgoVagaId: sgoVagaId(v.number), codigoSgo: codigoDaVaga(v.number), acao, sistema: SISTEMA,
    unidade: { sgoUnidadeId: v.unidade.id, nome: v.unidade.nome, cnpj: digitos(v.unidade.cnpj), razaoSocial: v.unidade.razaoSocial, cidade: null, uf: null, endereco: v.unidade.endereco },
    quantidade: v.quantidade,
    posicoes: v.posicoes.map((p) => ({
      ordem: p.ordem, cargo: p.cargo, motivo: p.motivo,
      substitui: p.substituiNome ? { nome: p.substituiNome, cpf: digitos(p.substituiCpf) } : null,
      /* Não existe campo de salário: o RH define pelo cargo. */
      escala: p.escala, horario: p.horario, salario: null,
      requisitos: p.requisitos, observacao: p.observacao, inicioDesejado: p.inicioDesejado,
    })),
    requisitos: v.requisitos, inicioDesejado: v.inicioDesejado, prioridade: v.prioridade, observacao: v.observacao,
    solicitante: v.solicitante, solicitadoEm: v.solicitadoEm,
    aprovacao: v.aprovacao,
  };
}

const cv = (c: CurriculoParaEnviar) => ({ sgoCurriculoId: sgoCurriculoId(c.number), nomeArquivo: c.nomeArquivo, contentType: c.contentType, indicadoPor: c.indicadoPor, conteudoBase64: c.conteudoBase64 });

export function corpoCriar(v: VagaParaEnviar, curriculos: CurriculoParaEnviar[]) {
  return { ...base(v, 'criar'), curriculos: curriculos.map(cv), cancelamento: null };
}
/** A edição do supervisor depois de entregue: o mesmo corpo, com os dados novos. O RH atualiza, não cria. */
export function corpoAtualizar(v: VagaParaEnviar) {
  return { ...base(v, 'atualizar'), codigoVaga: v.codigoRh, curriculos: [], cancelamento: null };
}
export function corpoCancelar(v: VagaParaEnviar, c: { motivo: string; por: string; canceladoEm: string }) {
  return { ...base(v, 'cancelar'), codigoVaga: v.codigoRh, curriculos: [], cancelamento: c };
}
/** Currículo novo de vaga já no RH — sem `posicoes` nem `unidade`. */
export function corpoCurriculo(v: { number: number; codigoRh: string | null }, c: CurriculoParaEnviar, envio: { gerente: { nome: string; email: string | null }; anexadoEm: string; supervisor: { nome: string; email: string | null } | null; aprovadoEm: string | null; observacao: string | null }) {
  return { sgoVagaId: sgoVagaId(v.number), codigoSgo: codigoDaVaga(v.number), acao: 'curriculo' as const, sistema: SISTEMA, codigoVaga: v.codigoRh, curriculos: [cv(c)], envio };
}

/* ───────────────────────── Rota 1: o que volta ───────────────────────── */

export type Classificacao =
  | { situacao: 'ENVIADO'; rhVagaId: string | null; codigoVaga: string | null }
  | { situacao: 'ERRO' | 'FALHA'; motivo: string };

const texto = (corpo: unknown): string => {
  if (typeof corpo === 'string') return corpo;
  const c = (corpo ?? {}) as Record<string, unknown>;
  const m = c.error ?? c.message ?? c.erro ?? c.detail ?? c.mensagem;
  return typeof m === 'string' ? m : m ? JSON.stringify(m) : '';
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

/**
 * O que a resposta do RH significa:
 *  2xx e 409 = ENVIADO (409 é "já tenho": o RH respondeu de novo o que já aceitou);
 *  400/413/422 e 401/403 = ERRO definitivo (motivo na tela, o supervisor reenvia);
 *  404/408/429/5xx = FALHA (tenta de novo sozinho). Resposta em HTML = rota ainda não publicada.
 */
export function classificarResposta(status: number, corpo: unknown): Classificacao {
  const t = texto(corpo);
  const html = typeof corpo === 'string' && /^\s*<(!doctype|html)/i.test(corpo);
  if (html) return { situacao: 'FALHA', motivo: 'O RH respondeu uma página em vez de dados — a rota de vagas ainda não foi publicada no RH.' };
  if ((status >= 200 && status < 300) || status === 409) {
    const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
    const d = (c.data && typeof c.data === 'object' ? c.data : c) as Record<string, unknown>;
    return { situacao: 'ENVIADO', rhVagaId: str(d.rhVagaId ?? d.id ?? c.rhVagaId), codigoVaga: str(d.codigoVaga ?? c.codigoVaga) };
  }
  const resumo = t ? `HTTP ${status} — ${t.slice(0, 300)}` : `HTTP ${status}`;
  if (status === 401 || status === 403) return { situacao: 'ERRO', motivo: `${resumo} (o RH não reconheceu a chave do SGO Restaurante)` };
  if (status === 400 || status === 413 || status === 422) return { situacao: 'ERRO', motivo: resumo };
  return { situacao: 'FALHA', motivo: resumo };
}

/** 5 min, 15 min, 1 h, 3 h e depois a cada 6 h. `tentativas` = quantas já falharam. */
export function esperaAteAProxima(tentativas: number): number {
  const MIN = 60_000;
  return [5 * MIN, 15 * MIN, 60 * MIN, 180 * MIN][Math.max(0, tentativas - 1)] ?? 360 * MIN;
}

/* ───────────────────────── Rota 2: cada passo da vaga ───────────────────────── */

export interface RetornoDaVaga { sgoVagaId: string; situacao: SituacaoDaVagaNoRh; rhEventoId: string | null; codigoVaga: string | null; candidato: string | null; observacao: string | null; ocorridoEm: string | null; sgoCurriculoId: string | null }
export type Validado<T> = { ok: true; dados: T } | { ok: false; erro: string };

const curto = (v: unknown, max: number) => { const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''; return s ? s.slice(0, max) : null; };
const instante = (v: unknown) => { const s = curto(v, 40); if (!s) return null; const dt = new Date(s); return Number.isNaN(dt.getTime()) ? null : dt.toISOString(); };

export function validarRetornoDaVaga(p: Record<string, unknown>): Validado<RetornoDaVaga> {
  const id = curto(p.sgoVagaId, 60);
  if (!id) return { ok: false, erro: 'sgoVagaId é obrigatório.' };
  const situacao = String(p.situacao ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!(SITUACOES_DA_VAGA_NO_RH as readonly string[]).includes(situacao)) return { ok: false, erro: `situacao inválida. Use uma de: ${SITUACOES_DA_VAGA_NO_RH.join(', ')}.` };
  /* Regra do processo: documento do candidato não sai do RH. */
  if (contemCpf(p.candidato) || contemCpf(p.observacao)) return { ok: false, erro: 'Não envie CPF em candidato nem em observacao: documento do candidato não sai do RH.' };
  return { ok: true, dados: { sgoVagaId: id, situacao: situacao as SituacaoDaVagaNoRh, rhEventoId: curto(p.rhEventoId, 120), codigoVaga: curto(p.codigoVaga, 60), candidato: curto(p.candidato, 160), observacao: curto(p.observacao, 1000), ocorridoEm: instante(p.ocorridoEm), sgoCurriculoId: curto(p.sgoCurriculoId, 60) } };
}

/* ───────────────────────── Rota 3: situação de cada currículo ───────────────────────── */

export interface RetornoDoCurriculo { sgoCurriculoId: string; situacao: SituacaoDoRh; observacao: string | null; rhEventoId: string | null; ocorridoEm: string | null }
export const LOTE_MAX = 200;

export function validarRetornoDoCurriculo(p: Record<string, unknown>): Validado<RetornoDoCurriculo> {
  const id = curto(p.sgoCurriculoId, 60);
  if (!id) return { ok: false, erro: 'sgoCurriculoId é obrigatório.' };
  const situacao = situacaoDoRh(p.situacao);
  if (!situacao) return { ok: false, erro: `situacao desconhecida. Use uma de: ${LISTA_DAS_SITUACOES}.` };
  if (contemCpf(p.observacao)) return { ok: false, erro: 'Não envie CPF na observacao: documento do candidato não sai do RH.' };
  return { ok: true, dados: { sgoCurriculoId: id, situacao, observacao: curto(p.observacao, 1000), rhEventoId: curto(p.rhEventoId, 120), ocorridoEm: instante(p.ocorridoEm) } };
}

/** O corpo da rota 3 pode ser um item ou `{ curriculos: [...] }`. */
export function itensDoLote(payload: Record<string, unknown>): { lote: boolean; itens: unknown[] } {
  if (Array.isArray(payload.curriculos)) return { lote: true, itens: payload.curriculos };
  return { lote: false, itens: [payload] };
}

/** É o retorno de currículo de VAGA (este módulo) e não da Central de Currículos antiga? */
export function ehRetornoDeVaga(payload: Record<string, unknown>): boolean {
  if (Array.isArray(payload.curriculos)) return true;
  return /^(rest-)?cv-/i.test(String(payload.sgoCurriculoId ?? ''));
}
