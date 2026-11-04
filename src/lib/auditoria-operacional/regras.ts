import {
  conformidade, situacaoDoEsperado, podeConfirmarFalha, prazoDeLancamento, podeAuditar, podeJustificar, diaEmBrasilia,
  ROTULO_SITUACAO, TOM_SITUACAO, MOTIVO_MIN, DATA_RE,
  type Conformidade, type SituacaoDaAuditoria, type RevisaoDaAuditoria, type CalendarioUtil, type EsperadoParaSituacao,
} from '@/lib/certificates/auditoria-regras';
import { MODULOS_DA_AUDITORIA_OPERACIONAL, chavePctOperacional, chavePrazoOperacional, type ModuloAuditado } from '@/lib/metas/vigencia-regras';

/**
 * AUDITORIA OPERACIONAL POR OCORRÊNCIA (v1.184.0) — as regras, sem banco.
 *
 * Generaliza a Auditoria de Atestados (v1.181.0) para os quatro módulos de
 * LANÇAMENTO que hoje só tinham o desconto "Fora do prazo": Notas recebidas,
 * Recebimento de gás, Coleta de óleo e Pagamentos. O que se audita não é o
 * fato (a nota, o gás, o óleo, o serviço): é o LANÇAMENTO dele no SGO pelo
 * gerente. A supervisão informa a OCORRÊNCIA ESPERADA (o que deveria ter sido
 * lançado, a data do fato, quando o gerente soube, de onde veio a informação);
 * o SGO cruza com o lançamento e diz a situação — a MESMA régua dos atestados:
 *
 *   NO_PRAZO · CONFORME · EM_CONFERENCIA · FALHA_CONFIRMADA · JUSTIFICADO · INVALIDO
 *
 * Só a FALHA CONFIRMADA pela supervisão (prazo vencido, sem lançamento no
 * prazo, sem justificativa aprovada) pesa. A penalização é POR FALHA, sobre o
 * PESO do componente do módulo, acumulada e limitada a 100%: com X% por falha,
 * N falhas tiram min(100, N × X)% do peso. Mês sem ocorrência decidida = neutro
 * (0/0, fora da conta — a regra de metas vigente).
 *
 * Sem duplicidade: um esperado ↔ um lançamento (chave única módulo + id), e o
 * lançamento auditado SAI da contagem do "Fora do prazo" (`late-entry.ts`).
 *
 * As funções de prazo, situação e conformidade são as dos atestados — uma
 * regra, dois lugares que a leem.
 */

export { conformidade, situacaoDoEsperado, podeConfirmarFalha, prazoDeLancamento, podeAuditar, podeJustificar, diaEmBrasilia, ROTULO_SITUACAO, TOM_SITUACAO, MOTIVO_MIN, DATA_RE };
export type { Conformidade, SituacaoDaAuditoria, RevisaoDaAuditoria, CalendarioUtil, EsperadoParaSituacao, ModuloAuditado };

export type OrigemDaInformacao = 'SUPERVISION' | 'SUPPLIER' | 'DOCUMENT' | 'OTHER';
export const ROTULO_ORIGEM: Record<OrigemDaInformacao, string> = {
  SUPERVISION: 'Supervisão / coordenação (viu na unidade)',
  SUPPLIER: 'Fornecedor / coletora / prestador',
  DOCUMENT: 'Documento (nota, recibo, comprovante)',
  OTHER: 'Outra origem',
};
export const ORIGENS: OrigemDaInformacao[] = ['SUPERVISION', 'SUPPLIER', 'DOCUMENT', 'OTHER'];
export const normalizarOrigem = (v: unknown): OrigemDaInformacao | null => (ORIGENS as string[]).includes(String(v)) ? (v as OrigemDaInformacao) : null;

/** O catálogo dos módulos auditados — rótulos, componente da meta, chaves dos parâmetros e o que a referência significa. */
export interface CatalogoDoModulo {
  key: ModuloAuditado;
  /** O componente da meta (NOTES_AUDIT…). */
  componente: string;
  rotulo: string;
  rotuloCurto: string;
  /** O que preencher em "referência". */
  referencia: string;
  /** O que a "data do fato" significa. */
  fato: string;
  /** Tela do módulo. */
  href: string;
  chavePrazo: string;
  chavePct: string;
  /** Entidade do dispatch de `/api/admin` para o peso. */
  entity: string;
}
export const MODULOS_AUDITADOS: CatalogoDoModulo[] = [
  { key: 'NOTES', componente: 'NOTES_AUDIT', rotulo: 'Notas recebidas', rotuloCurto: 'Notas', referencia: 'Fornecedor e número da nota', fato: 'Data em que a nota foi recebida na unidade', href: '/modulos/notas', chavePrazo: chavePrazoOperacional('NOTES'), chavePct: chavePctOperacional('NOTES'), entity: 'notesAuditMeta' },
  { key: 'GAS', componente: 'GAS_AUDIT', rotulo: 'Recebimento de gás', rotuloCurto: 'Gás', referencia: 'Fornecedor e número da nota (ou quilos)', fato: 'Data da entrega do gás', href: '/modulos/notas/gas', chavePrazo: chavePrazoOperacional('GAS'), chavePct: chavePctOperacional('GAS'), entity: 'gasAuditMeta' },
  { key: 'OIL', componente: 'OIL_AUDIT', rotulo: 'Coleta de óleo', rotuloCurto: 'Óleo', referencia: 'Coletora e litros (ou recibo)', fato: 'Data da coleta', href: '/modulos/oleo', chavePrazo: chavePrazoOperacional('OIL'), chavePct: chavePctOperacional('OIL'), entity: 'oilAuditMeta' },
  { key: 'PAYMENTS', componente: 'PAYMENTS_AUDIT', rotulo: 'Pagamentos', rotuloCurto: 'Pagamentos', referencia: 'Quem recebe (freelancer, colaborador) e o serviço', fato: 'Dia do serviço prestado', href: '/modulos/pagamentos', chavePrazo: chavePrazoOperacional('PAYMENTS'), chavePct: chavePctOperacional('PAYMENTS'), entity: 'paymentsAuditMeta' },
];
export const moduloAuditado = (k: unknown): CatalogoDoModulo | null => MODULOS_AUDITADOS.find((m) => m.key === String(k ?? '').toUpperCase()) ?? null;
/* O catálogo daqui e a lista da vigência (pesos/parâmetros) descrevem os MESMOS módulos — o teste trava. */
export const MODULOS_DA_VIGENCIA = MODULOS_DA_AUDITORIA_OPERACIONAL;

/** Janela do cruzamento automático: lançamento até N dias antes/depois da data do fato. */
export const JANELA_DE_CRUZAMENTO_DIAS = 3;
/** Dias (inteiros, UTC) entre dois dias 'AAAA-MM-DD'. */
export function diasEntre(a: string, b: string): number {
  const ms = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.abs(Math.round((ms(a) - ms(b)) / 86_400_000));
}
export const dentroDaJanela = (a: string, b: string, janela = JANELA_DE_CRUZAMENTO_DIAS) => diasEntre(a, b) <= janela;

/** Para a busca de duplicidade: caixa, acentos e espaços não distinguem referências. */
export function normalizarReferencia(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
export const REFERENCIA_MIN = 3;

export const PRAZO_PADRAO_HORAS = 24;
export const PCT_POR_FALHA_PADRAO = 10;

export interface ComponenteOperacional { done: number; missed: number; scorePct: number; penalizacao: number }
/**
 * O componente da meta: `done` = conformes + justificados, `missed` = falhas
 * confirmadas, `penalizacao` = min(100, falhas × pctPorFalha) sobre o peso,
 * `scorePct` = 100 − penalização. Sem base (nada decidido) → 0/0 = neutro.
 */
export function componenteOperacional(c: Conformidade, pctPorFalha: number): ComponenteOperacional {
  if (c.pct == null) return { done: 0, missed: 0, scorePct: 0, penalizacao: 0 };
  const pct = Math.max(0, Math.min(100, Number.isFinite(pctPorFalha) ? pctPorFalha : 0));
  const penalizacao = Math.min(100, Math.round(c.falhas * pct * 10) / 10);
  return { done: c.conformes + c.justificados, missed: c.falhas, scorePct: Math.round((100 - penalizacao) * 10) / 10, penalizacao };
}

/** A data do fato de um lançamento, por módulo (para o cruzamento e a janela). */
export interface LancamentoParaData { issueDate?: Date | null; entryDate?: Date | null; operationalDate?: string | null; workDate?: Date | null; createdAt: Date }
export function dataDoLancamento(modulo: ModuloAuditado, l: LancamentoParaData): string {
  const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  if (modulo === 'GAS' || modulo === 'OIL') return l.operationalDate ?? dia(l.createdAt)!;
  if (modulo === 'PAYMENTS') return dia(l.workDate) ?? dia(l.entryDate) ?? dia(l.createdAt)!;
  return dia(l.issueDate) ?? dia(l.entryDate) ?? dia(l.createdAt)!;
}

/** Soma dias a um dia 'AAAA-MM-DD' (UTC). */
export function somarDiasIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** Primeiro e último dia do mês 'AAAA-MM'. */
export function limitesDoMes(ym: string): { inicio: string; fim: string } {
  const [y, m] = ym.split('-').map(Number);
  const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { inicio: `${ym}-01`, fim };
}
