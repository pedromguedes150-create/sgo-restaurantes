import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { diaEmBrasilia } from './pontuacao';
import {
  CHAVE_ESCALA_GERENTES, CHAVE_FORA_DO_PRAZO, CHAVES_DA_META, COMPONENTES_DA_META, DESCONTO_ESCALA_GERENTES_PADRAO, DESCONTO_FORA_DO_PRAZO_PADRAO,
  MOTIVO_MIN, VIGENCIA_BASE, chaveDoPeso, chaveDoStatus, lerNumero, motivoValido, normalizarStatus, rotuloDaChave, statusHerdadoDoPeso, tipoDaChave,
  valorLegivel, valorVigente, vigenciaValida, type StatusDoComponente,
} from './vigencia-regras';

/**
 * CONFIGURAÇÃO DA META — leitura POR MÊS e gravação COM HISTÓRICO (v1.180.0).
 *
 * Antes, peso e desconto viviam só em `app_settings` e eram lidos "agora":
 * mudar o peso dos checklists em novembro reescrevia a nota de outubro, já
 * paga. Agora toda gravação vira uma linha em `meta_config_changes` com
 * vigência (mês), valor anterior, motivo e autor, e quem calcula a nota de um
 * mês pergunta o valor vigente NAQUELE mês (`carregarConfigDaMeta(ym)`).
 *
 * `app_settings` continua sendo escrito quando a vigência é o mês corrente —
 * é o que mantém qualquer leitor antigo (e a descrição da API v1) coerente —
 * e serve de fallback para chave sem histórico.
 */

/** Mês corrente em Brasília, 'AAAA-MM'. */
export const mesAtual = () => diaEmBrasilia(new Date()).slice(0, 7);

export interface ConfigDaMeta {
  yearMonth: string;
  /** Peso do componente (TASKS, WASTE…) vigente no mês. */
  peso(componente: string): number;
  /** Status do componente vigente no mês. */
  status(componente: string): StatusDoComponente;
  descontoForaDoPrazo: number;
  descontoEscalaGerentes: number;
  /** O texto gravado de qualquer chave (ou nulo). */
  valor(key: string): string | null;
}

function padraoDoPeso(componente: string): number {
  return COMPONENTES_DA_META.find((c) => c.key === componente)?.pesoPadrao ?? 0;
}

export async function carregarConfigDaMeta(yearMonth: string = mesAtual()): Promise<ConfigDaMeta> {
  const chaves = CHAVES_DA_META.map((c) => c.key);
  const [hist, settings] = await Promise.all([
    prisma.metaConfigChange.findMany({ where: { key: { in: chaves }, validFrom: { lte: yearMonth } }, select: { key: true, value: true, validFrom: true, createdAt: true } }),
    prisma.appSetting.findMany({ where: { key: { in: chaves } } }),
  ]);
  const porChave = new Map<string, typeof hist>();
  for (const h of hist) porChave.set(h.key, [...(porChave.get(h.key) ?? []), h]);
  const setting = new Map(settings.map((s) => [s.key, s.value]));
  const valor = (key: string): string | null => valorVigente(porChave.get(key) ?? [], yearMonth)?.value ?? setting.get(key) ?? null;
  const peso = (componente: string) => lerNumero(valor(chaveDoPeso(componente)), padraoDoPeso(componente), { inteiro: true });
  const status = (componente: string): StatusDoComponente => normalizarStatus(valor(chaveDoStatus(componente))) ?? statusHerdadoDoPeso(peso(componente));
  return {
    yearMonth,
    peso,
    status,
    descontoForaDoPrazo: lerNumero(valor(CHAVE_FORA_DO_PRAZO), DESCONTO_FORA_DO_PRAZO_PADRAO, { teto: 100 }),
    descontoEscalaGerentes: lerNumero(valor(CHAVE_ESCALA_GERENTES), DESCONTO_ESCALA_GERENTES_PADRAO, { teto: 100 }),
    valor,
  };
}

export type ResultadoDaGravacao =
  | { ok: true; validFrom: string; de: string | null; para: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; message?: string };

export interface GravacaoDaMeta {
  key: string;
  value: string | number;
  /** 'AAAA-MM'; sem informar = mês corrente. Nunca um mês já encerrado. */
  validFrom?: string | null;
  reason: string;
  /** Ação da Auditoria (ex.: TASKS_META_WEIGHT_SET) — mantém as etiquetas de sempre. */
  action: string;
}

/** Grava uma chave da meta com vigência, valor anterior, motivo e autor. Só ADMIN. */
export async function gravarConfigDaMeta(user: SessionUser, g: GravacaoDaMeta): Promise<ResultadoDaGravacao> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const tipo = tipoDaChave(g.key);
  if (!tipo) return { ok: false, reason: 'INVALID', message: 'Chave de configuração desconhecida.' };
  const hoje = mesAtual();
  const validFrom = g.validFrom ? String(g.validFrom) : hoje;
  if (!vigenciaValida(validFrom, hoje)) return { ok: false, reason: 'INVALID', message: 'A vigência precisa ser o mês corrente ou um mês futuro (AAAA-MM) — um mês encerrado não muda.' };
  if (!motivoValido(g.reason)) return { ok: false, reason: 'INVALID', message: `Informe o motivo da alteração (mínimo ${MOTIVO_MIN} caracteres).` };

  let value: string;
  if (tipo === 'STATUS') {
    const s = normalizarStatus(g.value);
    if (!s) return { ok: false, reason: 'INVALID', message: 'Status inválido.' };
    value = s;
  } else {
    const n = Number(g.value);
    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: 'INVALID', message: 'Valor inválido.' };
    value = tipo === 'PESO' ? String(Math.trunc(n)) : String(Math.min(100, n));
  }

  /* O valor anterior é o EFETIVO no mês da vigência (padrão incluído), não só o texto gravado:
     é o que o histórico mostra em "de → para" e o que vira linha-base na primeira gravação. */
  const vigente = await carregarConfigDaMeta(validFrom);
  const componente = CHAVES_DA_META.find((c) => c.key === g.key)?.componente ?? '';
  const de = tipo === 'STATUS' ? vigente.status(componente)
    : tipo === 'PESO' ? String(vigente.peso(componente))
    : String(g.key === CHAVE_FORA_DO_PRAZO ? vigente.descontoForaDoPrazo : vigente.descontoEscalaGerentes);
  if (de === value) return { ok: true, validFrom, de, para: value };

  const jaTemHistorico = (await prisma.metaConfigChange.count({ where: { key: g.key } })) > 0;
  await prisma.$transaction(async (tx) => {
    if (!jaTemHistorico) {
      /* Linha-base: o que valia antes de existir histórico (vale para todo mês
         anterior à vigência desta gravação — é o que preserva as notas fechadas). */
      await tx.metaConfigChange.create({ data: { key: g.key, value: de, validFrom: VIGENCIA_BASE, previousValue: null, reason: 'Valor em vigor antes do histórico (linha-base).', userId: null, userName: 'Sistema' } });
    }
    await tx.metaConfigChange.create({ data: { key: g.key, value, validFrom, previousValue: de, reason: g.reason.trim(), userId: user.id, userName: user.name } });
    if (validFrom <= hoje) {
      await tx.appSetting.upsert({ where: { key: g.key }, create: { key: g.key, value }, update: { value } });
    }
  });
  await audit({ userId: user.id, action: g.action, module: 'CONFIG', entity: 'metaConfig', entityId: g.key, metadata: { key: g.key, de, para: value, vigencia: validFrom, motivo: g.reason.trim() } });
  return { ok: true, validFrom, de, para: value };
}

export interface LinhaDoHistorico {
  id: string;
  key: string;
  rotulo: string;
  de: string;
  para: string;
  validFrom: string;
  /** Vigência legível: "nov/2026" ou "linha-base". */
  vigencia: string;
  reason: string;
  userName: string;
  createdAt: string;
  /** Gravação cuja vigência ainda não começou. */
  futura: boolean;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function vigenciaLegivel(validFrom: string): string {
  if (validFrom === VIGENCIA_BASE) return 'linha-base';
  const [y, m] = validFrom.split('-').map(Number);
  return `${MESES_CURTOS[(m || 1) - 1]}/${y}`;
}

/** As últimas gravações da Configuração da Meta, da mais recente para a mais antiga (linha-base fora). */
export async function historicoDeConfiguracoes(limit = 80): Promise<LinhaDoHistorico[]> {
  const rows = await prisma.metaConfigChange.findMany({ where: { validFrom: { not: VIGENCIA_BASE } }, orderBy: { createdAt: 'desc' }, take: limit });
  const hoje = mesAtual();
  return rows.map((r) => ({
    id: r.id, key: r.key, rotulo: rotuloDaChave(r.key),
    de: valorLegivel(r.key, r.previousValue), para: valorLegivel(r.key, r.value),
    validFrom: r.validFrom, vigencia: vigenciaLegivel(r.validFrom), reason: r.reason, userName: r.userName,
    createdAt: r.createdAt.toISOString(), futura: r.validFrom > hoje,
  }));
}

export interface CorrecaoDaSupervisao {
  id: string;
  createdAt: string;
  userName: string;
  unitName: string;
  lancamento: string;
  novaData: string;
  penaltyPct: number | null;
}

/** As correções de data feitas pela supervisão no mês (as que descontam "Fora do prazo"), para a conferência. */
export async function correcoesDaSupervisao(yearMonth: string, limit = 100): Promise<CorrecaoDaSupervisao[]> {
  const [y, m] = yearMonth.split('-').map(Number);
  const rows = await prisma.auditLog.findMany({
    where: { action: 'ENTRY_DATE_EDITED', createdAt: { gte: new Date(Date.UTC(y, m - 1, 1, 3)), lt: new Date(Date.UTC(y, m, 1, 3)) } },
    orderBy: { createdAt: 'desc' }, take: limit,
    select: { id: true, createdAt: true, entity: true, metadata: true, user: { select: { name: true } }, unit: { select: { name: true } } },
  });
  const rotulo: Record<string, string> = { payment: 'Pagamento', note: 'Nota', gas: 'Recebimento de gás', oil: 'Coleta de óleo' };
  return rows.map((r) => {
    const md = (r.metadata ?? {}) as { newDate?: string; penaltyPct?: number };
    return {
      id: r.id, createdAt: r.createdAt.toISOString(), userName: r.user?.name ?? '—', unitName: r.unit?.name ?? '—',
      lancamento: rotulo[r.entity ?? ''] ?? (r.entity ?? '—'),
      novaData: md.newDate ? md.newDate.split('-').reverse().join('/') : '—',
      penaltyPct: typeof md.penaltyPct === 'number' ? md.penaltyPct : null,
    };
  });
}
