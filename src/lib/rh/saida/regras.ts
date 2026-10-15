import type { CertificateType, RhDemandPriority, RhDemandType, RhNoticeMode, RhOutboundType, RhTerminationKind, RhTerminationReason } from '@prisma/client';

/**
 * Envio automático SGO → GBF-RH (v1.168.0) — as REGRAS, sem banco e sem rede.
 *
 * Tudo que decide alguma coisa mora aqui: quanto esperar entre tentativas,
 * o que cada resposta do RH significa, como mascarar CPF no log e como cada
 * registro do SGO vira o corpo que o contrato do RH espera. O despachante e a
 * fila (com Prisma) só executam o que está decidido aqui — e os testes puros
 * cobrem cada decisão sem subir nada.
 *
 * O contrato é o documento do RH de 14/10/2026 (`docs/integracao-rh-saida.md`).
 * Nenhum campo fora dele é enviado.
 */

export const MAX_TENTATIVAS = 10;

/** Caminhos no RH, relativos à base (`RH_API_URL`). */
export const ENDPOINTS: Record<RhOutboundType, string> = {
  ATESTADO: '/api/integracoes/sgo/atestados',
  DESLIGAMENTO: '/api/integracoes/sgo/desligamentos',
  DEMANDA: '/api/integracoes/sgo/demandas',
};

/** Caminho de consulta da situação (desligamento e demanda), por `sgoEventId`. */
export function caminhoDaSituacao(tipo: RhOutboundType, sgoEventId: string): string | null {
  if (tipo === 'ATESTADO') return null;
  return `${ENDPOINTS[tipo]}/${encodeURIComponent(sgoEventId)}`;
}

/* ───────────────────────────── Espera crescente ───────────────────────────── */

/**
 * Minutos de espera ANTES da tentativa de número `n` (1 = a primeira depois da
 * falha). Dobra a cada falha e para em 8 horas: 1, 2, 4, 8, 16, 32, 64, 128,
 * 256, 480 — as dez somam ~16h, o suficiente para o RH voltar de uma noite fora.
 */
export function esperaDaTentativaMin(n: number): number {
  const k = Math.max(1, Math.trunc(n));
  return Math.min(2 ** (k - 1), 480);
}

export function proximaTentativa(agora: Date, tentativasFeitas: number): Date {
  return new Date(agora.getTime() + esperaDaTentativaMin(tentativasFeitas) * 60_000);
}

/* ───────────────────────────── Resposta do RH ───────────────────────────── */

export type Classificacao =
  | { resultado: 'ENVIADO'; duplicado: boolean }
  | { resultado: 'ERRO'; motivo: string } // dados: não tenta de novo
  | { resultado: 'TOKEN'; motivo: string } // 401: parar e avisar
  | { resultado: 'ADIAR'; motivo: string }; // temporário: nova tentativa

/**
 * O que a resposta quer dizer — a regra 3 do contrato, numa função só.
 *  - 2xx, ou corpo `{status:"duplicado"}` → enviado (o RH já tinha o evento).
 *  - 400 / 422 / 409 (e demais 4xx de dados) → erro permanente; o RH explica
 *    em `resultado`/`error`, e isto vai para a tela do Admin.
 *  - 401 → token recusado: parar tudo e avisar.
 *  - 404 → módulo ainda não ligado no RH (desligamento/demanda): mais tarde.
 *  - 408 / 429 / 5xx → temporário.
 */
export function classificarResposta(status: number, corpo: unknown): Classificacao {
  const obj = corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : null;
  const statusTexto = typeof obj?.status === 'string' ? obj.status.toLowerCase() : '';
  if (statusTexto === 'duplicado') return { resultado: 'ENVIADO', duplicado: true };
  if (status >= 200 && status < 300) return { resultado: 'ENVIADO', duplicado: false };
  const motivo = motivoDaResposta(corpo, status);
  if (status === 401) return { resultado: 'TOKEN', motivo };
  if (status === 404 || status === 408 || status === 429 || status >= 500) return { resultado: 'ADIAR', motivo };
  return { resultado: 'ERRO', motivo };
}

/** Texto curto e legível do que o RH respondeu (sem CPF). */
export function motivoDaResposta(corpo: unknown, status: number): string {
  let texto = '';
  if (corpo && typeof corpo === 'object') {
    const o = corpo as Record<string, unknown>;
    const r = o.resultado ?? o.error ?? o.message ?? o.detail ?? o.status;
    texto = typeof r === 'string' ? r : r != null ? JSON.stringify(r) : JSON.stringify(o);
  } else if (typeof corpo === 'string') texto = corpo;
  texto = mascararCpfsNoTexto(texto).slice(0, 500);
  return `HTTP ${status}${texto ? ` — ${texto}` : ''}`;
}

/** Id que o RH devolve quando aceita, conforme o tipo do evento. */
export function extrairRhId(tipo: RhOutboundType, corpo: unknown): string | null {
  if (!corpo || typeof corpo !== 'object') return null;
  const o = corpo as Record<string, unknown>;
  const chave = tipo === 'ATESTADO' ? 'rhAtestadoId' : tipo === 'DESLIGAMENTO' ? 'processo' : 'numero';
  const v = o[chave];
  return v == null ? null : String(v);
}

/** Campo extra devolvido na aceitação (prazo legal do desligamento / prazo-alvo da demanda). */
export function extrairPrazo(tipo: RhOutboundType, corpo: unknown): string | null {
  if (!corpo || typeof corpo !== 'object') return null;
  const o = corpo as Record<string, unknown>;
  const v = tipo === 'DESLIGAMENTO' ? o.prazoLegal : tipo === 'DEMANDA' ? o.prazoAlvo : undefined;
  return v == null ? null : String(v);
}

/** Situações finais do andamento no RH — depois delas não se consulta mais. */
export const SITUACOES_FINAIS = new Set(['concluido', 'cancelado']);

/* ───────────────────────────── LGPD no log ───────────────────────────── */

/** `12345678901` → `123.***.***-01`. CPF incompleto volta mascarado por inteiro. */
export function mascararCpf(cpf: string | null | undefined): string {
  const d = String(cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return d ? '***' : '';
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

/** Mascara qualquer sequência de 11 dígitos (com ou sem pontuação) dentro de um texto. */
export function mascararCpfsNoTexto(texto: string): string {
  return String(texto ?? '').replace(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g, (_m, a: string, _b, _c, d: string) => `${a}.***.***-${d}`);
}

/**
 * Cópia de um objeto com todo campo `cpf` mascarado — para gravar/mostrar
 * resposta e erro sem CPF completo. Não toca em `anexo`/`carta` porque eles
 * nem entram no objeto gravado (o anexo é lido do volume na hora de enviar).
 */
export function mascararCpfNoObjeto<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(mascararCpfNoObjeto) as T;
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      out[k] = k.toLowerCase() === 'cpf' && typeof v === 'string' ? mascararCpf(v) : mascararCpfNoObjeto(v);
    }
    return out as T;
  }
  if (typeof valor === 'string') return mascararCpfsNoTexto(valor) as T;
  return valor;
}

/* ───────────────────────────── Anexo ───────────────────────────── */

export const ANEXO_MAX_BYTES = 10 * 1024 * 1024;
const ANEXO_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png']);

/** O RH aceita PDF, JPG ou PNG até 10 MB. Fora disso o envio vai SEM anexo, com nota. */
export function anexoAceito(caminho: string, bytes: number): { ok: true } | { ok: false; motivo: string } {
  const ext = (caminho.split('.').pop() ?? '').toLowerCase();
  if (!ANEXO_EXT.has(ext)) return { ok: false, motivo: `formato .${ext || '?'} não aceito pelo RH (PDF, JPG ou PNG)` };
  if (bytes > ANEXO_MAX_BYTES) return { ok: false, motivo: `arquivo com ${(bytes / 1024 / 1024).toFixed(1)} MB (máximo 10 MB)` };
  return { ok: true };
}

export function nomeDoAnexo(caminho: string): string {
  return caminho.split('/').pop() || 'anexo';
}

/* ───────────────────────────── Payloads ───────────────────────────── */

export type AcaoAtestado = 'criar' | 'atualizar' | 'cancelar' | 'retorno';
export const ACOES_ATESTADO: readonly AcaoAtestado[] = ['criar', 'atualizar', 'cancelar', 'retorno'];

/** `motivo` do atestado no RH, pelo tipo do SGO. */
export function motivoDoAtestado(tipo: CertificateType): 'DOENCA' | 'ACOMPANHANTE' | 'OUTROS' {
  if (tipo === 'COMPANION') return 'ACOMPANHANTE';
  if (tipo === 'FULL_DAY') return 'DOENCA';
  return 'OUTROS';
}

export interface AtestadoParaEnvio {
  id: string;
  cpf: string;
  type: CertificateType;
  startDate: string;
  endDate: string | null;
  cid?: string | null;
  observation?: string | null;
}

/**
 * Corpo do A1 SEM `sgoEventId` (a fila põe) e SEM `anexo` (vai na hora).
 * As quatro ações têm a MESMA forma — `atualizar` e `retorno` já saem daqui
 * quando um dia tiverem gatilho (hoje só criar e cancelar têm).
 */
export function payloadAtestado(a: AtestadoParaEnvio, acao: AcaoAtestado): Record<string, unknown> {
  const p: Record<string, unknown> = {
    sgoMovimentoId: a.id,
    acao,
    cpf: a.cpf,
    tipo: 'A',
    tipoDetalhe: a.type,
    dataInicio: a.startDate,
    dataFim: a.endDate ?? null,
    motivo: motivoDoAtestado(a.type),
  };
  if (a.cid?.trim()) p.cid = a.cid.trim();
  if (a.observation?.trim()) p.observacoes = a.observation.trim();
  return p;
}

export const TIPO_DESLIGAMENTO: Record<RhTerminationKind, string> = {
  DISPENSA_SEM_JUSTA_CAUSA: 'dispensa_sem_justa_causa',
  JUSTA_CAUSA: 'justa_causa',
  PEDIDO_DEMISSAO: 'pedido_demissao',
  ACORDO_484A: 'acordo_484a',
  TERMINO_EXPERIENCIA: 'termino_experiencia',
};
export const MODALIDADE_AVISO: Record<RhNoticeMode, string> = {
  TRABALHADO_2H: 'trabalhado_2h',
  TRABALHADO_7DIAS: 'trabalhado_7dias',
  INDENIZADO: 'indenizado',
  NAO_CUMPRIDO: 'nao_cumprido',
};
export const MOTIVO_DESLIGAMENTO: Record<RhTerminationReason, string> = {
  DESEMPENHO: 'desempenho',
  COMPORTAMENTO: 'comportamento',
  FALTAS_ATRASOS: 'faltas_atrasos',
  REDUCAO_QUADRO: 'reducao_quadro',
  FIM_EXPERIENCIA: 'fim_experiencia',
  OUTRA_OPORTUNIDADE: 'outra_oportunidade',
  MOTIVO_PESSOAL: 'motivo_pessoal',
  SAUDE: 'saude',
  OUTRO: 'outro',
};

/** Justa causa e término de experiência não têm modalidade de aviso (contrato do RH). */
export function tipoSemAviso(kind: RhTerminationKind): boolean {
  return kind === 'JUSTA_CAUSA' || kind === 'TERMINO_EXPERIENCIA';
}

export interface DesligamentoInput {
  terminationKind: RhTerminationKind;
  noticeMode?: RhNoticeMode | null;
  reasonCode: RhTerminationReason;
  terminationDate: string;
  reason: string; // texto livre do gerente
  letterPath?: string | null;
}

/**
 * Validação do pedido de desligamento contra o contrato, antes de gravar:
 * carta obrigatória em pedido de demissão; justificativa obrigatória quando o
 * motivo é "outro"; modalidade de aviso obrigatória — exceto nos tipos sem aviso,
 * onde ela é IGNORADA (o RH não a aceita).
 */
export function validarDesligamento(d: DesligamentoInput): { ok: true; noticeMode: RhNoticeMode | null } | { ok: false; motivo: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.terminationDate)) return { ok: false, motivo: 'Informe a data do desligamento.' };
  if (d.reasonCode === 'OUTRO' && !d.reason.trim()) return { ok: false, motivo: 'Com motivo "Outro", a justificativa é obrigatória.' };
  if (d.terminationKind === 'PEDIDO_DEMISSAO' && !d.letterPath) return { ok: false, motivo: 'Pedido de demissão exige a carta assinada (PDF).' };
  if (tipoSemAviso(d.terminationKind)) return { ok: true, noticeMode: null };
  if (!d.noticeMode) return { ok: false, motivo: 'Escolha a modalidade do aviso prévio.' };
  return { ok: true, noticeMode: d.noticeMode };
}

export interface DesligamentoParaEnvio extends DesligamentoInput {
  cpf: string;
  unitCnpj: string;
  solicitanteNome: string;
  solicitanteEmail: string | null;
}

/** Corpo do A2 sem `sgoEventId` e sem `carta` (a carta é lida do volume na hora). */
export function payloadDesligamento(d: DesligamentoParaEnvio): Record<string, unknown> {
  const p: Record<string, unknown> = {
    cpf: d.cpf,
    unitCode: d.unitCnpj.replace(/\D/g, ''),
    dataDesligamento: d.terminationDate,
    tipo: TIPO_DESLIGAMENTO[d.terminationKind],
    motivo: MOTIVO_DESLIGAMENTO[d.reasonCode],
    solicitanteNome: d.solicitanteNome,
    solicitanteEmail: d.solicitanteEmail ?? '',
  };
  if (!tipoSemAviso(d.terminationKind) && d.noticeMode) p.modalidadeAviso = MODALIDADE_AVISO[d.noticeMode];
  const texto = d.reason.trim();
  if (d.reasonCode === 'OUTRO') p.justificativa = texto;
  else if (texto) p.observacao = texto;
  return p;
}

export const TIPO_DEMANDA: Record<RhDemandType, string> = {
  ADMISSAO: 'admissao',
  DESLIGAMENTO: 'desligamento',
  ATESTADO: 'atestado',
  FERIAS: 'ferias',
  MUDANCA_HORARIO: 'mudanca_horario',
  MUDANCA_FUNCAO_SALARIO: 'mudanca_funcao_salario',
  BENEFICIO: 'beneficio',
  DUVIDA: 'duvida',
  OUTRO: 'outro',
};
export const PRIORIDADE_DEMANDA: Record<RhDemandPriority, string> = { NORMAL: 'normal', ALTA: 'alta', URGENTE: 'urgente' };

export const TITULO_MAX = 200;
export const DESCRICAO_MAX = 5000;

export interface DemandaParaEnvio {
  tipo: RhDemandType;
  titulo: string;
  descricao?: string | null;
  cpf?: string | null;
  unitCnpj?: string | null;
  solicitanteNome: string;
  solicitanteEmail?: string | null;
  dataEvento?: string | null;
  prioridade: RhDemandPriority;
}

/** Corpo do A3 sem `sgoEventId`. Campos opcionais só vão quando têm valor. */
export function payloadDemanda(d: DemandaParaEnvio): Record<string, unknown> {
  const p: Record<string, unknown> = {
    tipo: TIPO_DEMANDA[d.tipo],
    titulo: d.titulo.trim().slice(0, TITULO_MAX),
    solicitanteNome: d.solicitanteNome,
    prioridade: PRIORIDADE_DEMANDA[d.prioridade],
  };
  if (d.descricao?.trim()) p.descricao = d.descricao.trim().slice(0, DESCRICAO_MAX);
  if (d.cpf) p.cpf = d.cpf;
  const cnpj = d.unitCnpj?.replace(/\D/g, '');
  if (cnpj) p.unitCode = cnpj;
  if (d.solicitanteEmail) p.solicitanteEmail = d.solicitanteEmail;
  if (d.dataEvento && /^\d{4}-\d{2}-\d{2}$/.test(d.dataEvento)) p.dataEvento = d.dataEvento;
  return p;
}

/* ───────────────────────────── Rótulos ───────────────────────────── */

export const ROTULO_TIPO: Record<RhOutboundType, string> = { ATESTADO: 'Atestado', DESLIGAMENTO: 'Desligamento', DEMANDA: 'Demanda ao RH' };

export const ROTULO_SITUACAO: Record<string, string> = {
  solicitado: 'Solicitado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export function rotuloDaSituacao(s: string | null | undefined): string {
  if (!s) return 'Aguardando envio ao RH';
  return ROTULO_SITUACAO[s] ?? s;
}
