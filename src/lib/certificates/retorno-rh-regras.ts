import type { DocumentStatus } from '@prisma/client';
import { nomenclaturaPorNome, type Nomenclatura } from '@/lib/certificates/catalogo';

/**
 * RETORNO DO RH — regras PURAS (v1.197.0, etapa B da Central de Atestados e Afins).
 *
 * O RH valida o documento NO SISTEMA DELE (decisão do Daniel, 09/11/2026) e devolve a
 * decisão ao SGO pelo webhook de entrada `POST /api/integracoes/rh/atestado-situacao`.
 * Aqui mora o contrato desse evento: as situações aceitas, os motivos de correção,
 * a validação do corpo e a mensagem que vai ao gerente — SEM dado médico.
 */

/** Situações que o RH informa → situação do SGO. */
export const SITUACOES_DO_RH = {
  em_analise: 'EM_ANALISE_RH',
  validado: 'VALIDADO_RH',
  correcao_solicitada: 'CORRECAO_SOLICITADA',
  nao_aceito: 'NAO_ACEITO',
  concluido: 'CONCLUIDO',
} as const satisfies Record<string, DocumentStatus>;
export type SituacaoDoRh = keyof typeof SITUACOES_DO_RH;

/** Motivos de correção/recusa (código estável → rótulo para o gerente). */
export const MOTIVOS_DE_CORRECAO: Record<string, string> = {
  ilegivel: 'Documento ilegível',
  foto_cortada: 'Foto cortada',
  incompleto: 'Documento incompleto',
  colaborador_incorreto: 'Colaborador incorreto',
  datas_divergentes: 'Datas divergentes',
  documento_complementar: 'Precisa de documento complementar',
  classificacao_revisar: 'Classificação a revisar',
  outro: 'Outro motivo',
};
export function rotuloDoMotivo(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return MOTIVOS_DE_CORRECAO[codigo] ?? codigo;
}

/** Situações em que o RH EXIGE motivo + observação. */
export const SITUACOES_COM_MOTIVO: readonly SituacaoDoRh[] = ['correcao_solicitada', 'nao_aceito'];

export const OBSERVACAO_MAX = 500;

/**
 * A observação do RH aparece na tela do GERENTE: não pode trazer CID nem
 * diagnóstico. Barra o padrão da CID-10 (letra + 2 dígitos, com ou sem
 * subcategoria: "J11", "M54.5", "F32.1") e a palavra "CID". Não é filtro
 * perfeito — é a última barreira; a primeira é o RH não escrever.
 */
const RE_CID = /\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b/;
const RE_PALAVRA_CID = /\bCID\b/i;
export function contemDadoMedico(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return RE_CID.test(texto) || RE_PALAVRA_CID.test(texto);
}

export interface RetornoDoRh {
  sgoMovimentoId: string;
  sgoEventId: string | null;
  rhAtestadoId: string | null;
  situacao: SituacaoDoRh;
  status: DocumentStatus;
  motivo: string | null;
  observacao: string | null;
  /** Nomenclatura do catálogo, se o RH reclassificou com um nome válido. */
  nomenclatura: Nomenclatura | null;
  /** O RH mandou um nome que não está no catálogo (fica registrado, não aplicado). */
  nomenclaturaDesconhecida: string | null;
  data: string | null;
}

export type ValidacaoDoRetorno = { ok: true; dados: RetornoDoRh } | { ok: false; erro: string };

/** Valida o corpo do evento `atestado-situacao`. Só forma e regras; nada de banco. */
export function validarRetornoDoRh(payload: Record<string, unknown>, resolverNomenclatura: (texto: string) => Nomenclatura | null = (t) => nomenclaturaPorNome(t)): ValidacaoDoRetorno {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const sgoMovimentoId = str(payload.sgoMovimentoId);
  if (!sgoMovimentoId) return { ok: false, erro: 'sgoMovimentoId é obrigatório (o id do documento no SGO)' };
  const situacaoTexto = str(payload.situacao)?.toLowerCase().replace(/-/g, '_') ?? null;
  if (!situacaoTexto || !(situacaoTexto in SITUACOES_DO_RH)) {
    return { ok: false, erro: `situacao inválida — use ${Object.keys(SITUACOES_DO_RH).join(' | ')}` };
  }
  const situacao = situacaoTexto as SituacaoDoRh;
  const motivo = str(payload.motivo)?.toLowerCase().replace(/-/g, '_') ?? null;
  const observacao = str(payload.observacao);
  if (SITUACOES_COM_MOTIVO.includes(situacao)) {
    if (!motivo) return { ok: false, erro: `motivo é obrigatório em ${situacao} — use ${Object.keys(MOTIVOS_DE_CORRECAO).join(' | ')}` };
    if (!(motivo in MOTIVOS_DE_CORRECAO)) return { ok: false, erro: `motivo desconhecido: ${motivo}` };
    if (!observacao) return { ok: false, erro: `observacao é obrigatória em ${situacao} (texto curto para o gerente, sem dado médico)` };
  }
  if (motivo && !(motivo in MOTIVOS_DE_CORRECAO)) return { ok: false, erro: `motivo desconhecido: ${motivo}` };
  if (observacao && observacao.length > OBSERVACAO_MAX) return { ok: false, erro: `observacao com mais de ${OBSERVACAO_MAX} caracteres` };
  if (contemDadoMedico(observacao)) return { ok: false, erro: 'observacao não pode conter CID ou dado médico — ela aparece para o gerente' };

  const nomeRh = str(payload.nomenclaturaRh);
  const nomenclatura = nomeRh ? resolverNomenclatura(nomeRh) : null;
  return {
    ok: true,
    dados: {
      sgoMovimentoId,
      sgoEventId: str(payload.sgoEventId),
      rhAtestadoId: str(payload.rhAtestadoId),
      situacao,
      status: SITUACOES_DO_RH[situacao],
      motivo,
      observacao,
      nomenclatura,
      nomenclaturaDesconhecida: nomeRh && !nomenclatura ? nomeRh : null,
      data: str(payload.data),
    },
  };
}

/**
 * Repetição: o mesmo evento chegando duas vezes (mesma situação, mesmo motivo,
 * mesma observação) não é erro nem gera segundo aviso ao gerente.
 */
export function ehRepeticao(atual: { status: DocumentStatus; statusMotivo: string | null; statusNote: string | null }, novo: RetornoDoRh): boolean {
  return atual.status === novo.status && (atual.statusMotivo ?? null) === (novo.motivo ?? null) && (atual.statusNote ?? null) === (novo.observacao ?? null);
}

/** O gerente só corrige quando o RH pediu correção. */
export function podeCorrigir(status: DocumentStatus): boolean {
  return status === 'CORRECAO_SOLICITADA';
}

/** Situações em que o documento DEIXA de marcar a Escala (o RH disse que não vale). */
export const SITUACOES_SEM_EFEITO_NA_ESCALA: readonly DocumentStatus[] = ['NAO_ACEITO'];

/** Aviso ao gerente — título e corpo, sem dado médico (a observação já passou pelo filtro). */
export function mensagemParaOGerente(r: RetornoDoRh, colaborador: string, rotuloDoDocumento: string): { title: string; body: string; importante: boolean } {
  const doc = `${rotuloDoDocumento} de ${colaborador}`;
  switch (r.situacao) {
    case 'em_analise': return { title: 'RH: documento em análise', body: `${doc} está em análise pelo RH.`, importante: false };
    case 'validado': return { title: 'RH: documento validado', body: `${doc} foi validado pelo RH.${r.observacao ? ` ${r.observacao}` : ''}`, importante: false };
    case 'correcao_solicitada': return { title: 'RH pediu correção de um documento', body: `${doc} precisa de correção. Motivo: ${rotuloDoMotivo(r.motivo)}. ${r.observacao ?? ''} Abra o Histórico e use "Corrigir e reenviar".`.trim(), importante: true };
    case 'nao_aceito': return { title: 'RH não aceitou um documento', body: `${doc} não foi aceito. Motivo: ${rotuloDoMotivo(r.motivo)}. ${r.observacao ?? ''}`.trim(), importante: true };
    case 'concluido': return { title: 'RH: documento concluído', body: `${doc}: tratamento encerrado pelo RH.`, importante: false };
  }
}
