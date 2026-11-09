import type { DocumentStatus, RhOutboundStatus } from '@prisma/client';
import type { Alerta } from '@/lib/certificates/alertas';
import type { GrupoDoDocumento } from '@/lib/certificates/catalogo';

/**
 * PAINEL DO RH E FILTROS DO HISTÓRICO — PURO (v1.199.0, etapa D da Central de
 * Atestados e Afins). Nada aqui lê banco: recebe as linhas já carregadas e
 * responde "o que está pendente", "o que o gerente precisa ver primeiro" e
 * "o que passa no filtro". Cliente e servidor usam as mesmas funções.
 */
export interface LinhaDoPainel {
  id: string;
  unitId: string;
  unitName: string;
  collaboratorName: string;
  rotulo: string;
  grupo: GrupoDoDocumento;
  status: DocumentStatus;
  statusAt: string | null;
  statusMotivoLabel: string | null;
  statusNote: string | null;
  startDate: string;
  endDate: string;
  days: number;
  createdAt: string | null;
  by: string | null;
  alertas: Alerta[];
  /** Último evento da fila de saída para este documento (null = anterior à integração). */
  envioRh: { acao: string; status: RhOutboundStatus; erro: string | null } | null;
}

export const LIMITES_DO_PAINEL = {
  /** Correção solicitada há mais de N dias sem o gerente reenviar. */
  diasCorrecaoSemResposta: 3,
  /** Enviado ao RH há mais de N dias sem nenhuma decisão de volta. */
  diasSemRetornoDoRh: 7,
  /** Retornos previstos nos próximos N dias. */
  diasRetornoProximo: 7,
} as const;

export type TipoDePendencia = 'CORRECAO_SEM_RESPOSTA' | 'CLASSIFICACAO_PENDENTE' | 'SEM_RETORNO_DO_RH' | 'ENVIO_COM_ERRO' | 'ALERTA_ALTO' | 'RETORNO_PROXIMO';

export const ROTULO_DA_PENDENCIA: Record<TipoDePendencia, { titulo: string; explicacao: string; tom: 'danger' | 'warning' | 'info' }> = {
  CORRECAO_SEM_RESPOSTA: { titulo: 'Correção pedida e ainda sem reenvio', explicacao: `O RH pediu correção há mais de ${LIMITES_DO_PAINEL.diasCorrecaoSemResposta} dias e o gerente ainda não reenviou.`, tom: 'danger' },
  ENVIO_COM_ERRO: { titulo: 'Envio ao RH com erro', explicacao: 'A fila não conseguiu entregar (dado faltando, recusa do RH ou tentativas esgotadas). Resolver em Configurações → Envios ao RH.', tom: 'danger' },
  CLASSIFICACAO_PENDENTE: { titulo: 'Sem classificação', explicacao: 'A IA não teve segurança para dizer o tipo; o RH define na análise (ou devolve o nome em nomenclaturaRh).', tom: 'warning' },
  SEM_RETORNO_DO_RH: { titulo: 'Enviado e sem resposta do RH', explicacao: `Chegou ao RH há mais de ${LIMITES_DO_PAINEL.diasSemRetornoDoRh} dias e nenhuma decisão voltou (validado, correção ou não aceito).`, tom: 'warning' },
  ALERTA_ALTO: { titulo: 'Alertas que pedem ação', explicacao: 'Análise INSS, intercalados, CAT ou prazo diferente da regra — documentos ainda não concluídos.', tom: 'warning' },
  RETORNO_PROXIMO: { titulo: 'Retornos nos próximos dias', explicacao: `Afastamentos e licenças que terminam nos próximos ${LIMITES_DO_PAINEL.diasRetornoProximo} dias.`, tom: 'info' },
};
export const ORDEM_DAS_PENDENCIAS: TipoDePendencia[] = ['CORRECAO_SEM_RESPOSTA', 'ENVIO_COM_ERRO', 'CLASSIFICACAO_PENDENTE', 'SEM_RETORNO_DO_RH', 'ALERTA_ALTO', 'RETORNO_PROXIMO'];

export interface Pendencia { tipo: TipoDePendencia; doc: LinhaDoPainel; detalhe: string }

const FINAIS: readonly DocumentStatus[] = ['VALIDADO_RH', 'NAO_ACEITO', 'CONCLUIDO'];
const ERROS_DA_FILA: readonly RhOutboundStatus[] = ['ERRO', 'ESGOTADO', 'PARADO'];

function diasEntre(deISO: string, ateISO: string): number {
  const a = Date.parse(deISO.slice(0, 10) + 'T00:00:00Z'); const b = Date.parse(ateISO.slice(0, 10) + 'T00:00:00Z');
  return Math.floor((b - a) / 86_400_000);
}
function somarDias(iso: string, n: number): string { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fmt(iso: string): string { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

/** As pendências do painel, na ordem de prioridade, com o resumo por tipo. */
export function montarPendencias(rows: LinhaDoPainel[], hoje: string, limites = LIMITES_DO_PAINEL): { pendencias: Pendencia[]; resumo: Record<TipoDePendencia, number> } {
  const pendencias: Pendencia[] = [];
  for (const r of rows) {
    const ref = r.statusAt ?? r.createdAt;
    const diasNaSituacao = ref ? diasEntre(ref, hoje) : 0;
    if (r.status === 'CORRECAO_SOLICITADA' && diasNaSituacao > limites.diasCorrecaoSemResposta) {
      pendencias.push({ tipo: 'CORRECAO_SEM_RESPOSTA', doc: r, detalhe: `${r.statusMotivoLabel ?? 'Correção'} há ${diasNaSituacao} dias${r.statusNote ? ` — ${r.statusNote}` : ''}` });
    }
    if (r.envioRh && ERROS_DA_FILA.includes(r.envioRh.status) && !FINAIS.includes(r.status)) {
      pendencias.push({ tipo: 'ENVIO_COM_ERRO', doc: r, detalhe: `${r.envioRh.acao} ${r.envioRh.status.toLowerCase()}${r.envioRh.erro ? ` — ${r.envioRh.erro}` : ''}` });
    }
    if (r.status === 'CLASSIFICACAO_PENDENTE') {
      pendencias.push({ tipo: 'CLASSIFICACAO_PENDENTE', doc: r, detalhe: `Lançado${r.by ? ` por ${r.by}` : ''}${r.createdAt ? ` há ${diasEntre(r.createdAt, hoje)} dias` : ''}` });
    }
    if ((r.status === 'ENVIADO_RH' || r.status === 'CORRIGIDO_REENVIADO') && diasNaSituacao > limites.diasSemRetornoDoRh) {
      pendencias.push({ tipo: 'SEM_RETORNO_DO_RH', doc: r, detalhe: `No RH há ${diasNaSituacao} dias sem decisão` });
    }
    const altos = r.alertas.filter((a) => a.gravidade !== 'info' && a.tipo !== 'RETORNO');
    if (altos.length && !FINAIS.includes(r.status)) {
      pendencias.push({ tipo: 'ALERTA_ALTO', doc: r, detalhe: altos.map((a) => a.texto).join(' ') });
    }
    if (r.status !== 'NAO_ACEITO' && r.alertas.some((a) => a.tipo === 'RETORNO') && r.endDate >= hoje && r.endDate <= somarDias(hoje, limites.diasRetornoProximo)) {
      pendencias.push({ tipo: 'RETORNO_PROXIMO', doc: r, detalhe: `Volta em ${fmt(somarDias(r.endDate, 1))}` });
    }
  }
  const ordem = new Map(ORDEM_DAS_PENDENCIAS.map((t, i) => [t, i]));
  pendencias.sort((a, b) => (ordem.get(a.tipo)! - ordem.get(b.tipo)!) || a.doc.collaboratorName.localeCompare(b.doc.collaboratorName));
  const resumo = Object.fromEntries(ORDEM_DAS_PENDENCIAS.map((t) => [t, pendencias.filter((p) => p.tipo === t).length])) as Record<TipoDePendencia, number>;
  return { pendencias, resumo };
}

/* ───────────────────────── O que o gerente vê primeiro ───────────────────────── */
export type FaixaDoGerente = 'ENVIADOS' | 'EM_ANALISE' | 'CORRECOES' | 'CONCLUIDOS' | 'NAO_ACEITOS';
export const FAIXAS_DO_GERENTE: Record<FaixaDoGerente, { rotulo: string; situacoes: DocumentStatus[] }> = {
  ENVIADOS: { rotulo: 'Enviados', situacoes: ['AGUARDANDO_LEITURA', 'LEITURA_CONCLUIDA', 'CLASSIFICACAO_PENDENTE', 'ENVIADO_RH', 'CORRIGIDO_REENVIADO'] },
  EM_ANALISE: { rotulo: 'Em análise', situacoes: ['EM_ANALISE_RH'] },
  CORRECOES: { rotulo: 'Correções solicitadas', situacoes: ['CORRECAO_SOLICITADA'] },
  CONCLUIDOS: { rotulo: 'Concluídos', situacoes: ['VALIDADO_RH', 'CONCLUIDO'] },
  NAO_ACEITOS: { rotulo: 'Não aceitos', situacoes: ['NAO_ACEITO'] },
};
export const ORDEM_DAS_FAIXAS: FaixaDoGerente[] = ['ENVIADOS', 'EM_ANALISE', 'CORRECOES', 'CONCLUIDOS', 'NAO_ACEITOS'];

export function faixaDaSituacao(s: DocumentStatus): FaixaDoGerente {
  for (const f of ORDEM_DAS_FAIXAS) if (FAIXAS_DO_GERENTE[f].situacoes.includes(s)) return f;
  return 'ENVIADOS';
}

export function kpisDoGerente(rows: { status: DocumentStatus }[]): Record<FaixaDoGerente, number> {
  const out = Object.fromEntries(ORDEM_DAS_FAIXAS.map((f) => [f, 0])) as Record<FaixaDoGerente, number>;
  for (const r of rows) out[faixaDaSituacao(r.status)]++;
  return out;
}

/* ───────────────────────── Filtros do Histórico ───────────────────────── */
export interface FiltroDoHistorico {
  faixa?: FaixaDoGerente | 'TODAS';
  grupo?: GrupoDoDocumento | 'TODOS';
  /** Busca sem acento/caixa em colaborador, tipo e unidade. */
  texto?: string;
  /** AAAA-MM do início do período; vazio = todos. */
  mes?: string;
  /** Só documentos com alerta de ação (alta/média). */
  soComAlerta?: boolean;
}

export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filtrarHistorico<T extends { status: DocumentStatus; grupo: GrupoDoDocumento; collaboratorName: string; rotulo: string; unitName: string; startDate: string; alertas: Alerta[] }>(rows: T[], f: FiltroDoHistorico): T[] {
  const texto = f.texto ? normalizarTexto(f.texto) : '';
  return rows.filter((r) => {
    if (f.faixa && f.faixa !== 'TODAS' && faixaDaSituacao(r.status) !== f.faixa) return false;
    if (f.grupo && f.grupo !== 'TODOS' && r.grupo !== f.grupo) return false;
    if (f.mes && !r.startDate.startsWith(f.mes)) return false;
    if (f.soComAlerta && !r.alertas.some((a) => a.gravidade !== 'info')) return false;
    if (texto && !normalizarTexto(`${r.collaboratorName} ${r.rotulo} ${r.unitName}`).includes(texto)) return false;
    return true;
  });
}
