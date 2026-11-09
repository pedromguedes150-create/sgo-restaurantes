import { prisma } from '@/lib/db/prisma';
import { listCertificates, type CertListItem } from '@/lib/certificates/query';
import { listarConfigDasNomenclaturas } from '@/lib/certificates/config-nomenclaturas';
import { hojeISO } from '@/lib/certificates/config-nomenclaturas';
import { montarPendencias, type LinhaDoPainel, type Pendencia, type TipoDePendencia } from '@/lib/certificates/painel-rh-calculo';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PAINEL DO RH (v1.199.0) — composição: as linhas do Histórico (mesma leitura,
 * mesmo escopo), o último evento da fila de saída por documento e a
 * configuração das nomenclaturas. Nada é gravado; nenhuma conta paralela.
 */
export interface PainelDoRh {
  hoje: string;
  total: number;
  pendencias: Pendencia[];
  resumo: Record<TipoDePendencia, number>;
  porSituacao: { status: CertListItem['status']; count: number }[];
  porNomenclatura: { rotulo: string; grupo: CertListItem['grupo']; count: number; days: number }[];
  nomenclaturas: { total: number; inativas: number; comNomeNoRh: number };
  linhas: LinhaDoPainel[];
}

/** Linhas do painel a partir da lista + fila. */
export async function linhasDoPainel(user: SessionUser, filters: { unitId?: string } = {}): Promise<LinhaDoPainel[]> {
  const rows = await listCertificates(user, filters);
  const ids = rows.map((r) => r.id);
  const eventos = ids.length ? await prisma.rhOutboundEvent.findMany({ where: { tipo: 'ATESTADO', referenceId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { referenceId: true, acao: true, status: true, ultimoErro: true } }) : [];
  const ultimo = new Map<string, { acao: string; status: typeof eventos[number]['status']; erro: string | null }>();
  for (const e of eventos) if (!ultimo.has(e.referenceId)) ultimo.set(e.referenceId, { acao: e.acao, status: e.status, erro: e.ultimoErro });
  return rows.map((r) => ({
    id: r.id, unitId: r.unitId, unitName: r.unitName, collaboratorName: r.collaboratorName, rotulo: r.rotulo, grupo: r.grupo,
    status: r.status, statusAt: r.statusAt, statusMotivoLabel: r.statusMotivoLabel, statusNote: r.statusNote,
    startDate: r.startDate, endDate: r.endDate, days: r.days, createdAt: r.createdAt, by: r.by, alertas: r.alertas,
    envioRh: ultimo.get(r.id) ?? null,
  }));
}

export async function getPainelDoRh(user: SessionUser, filters: { unitId?: string } = {}): Promise<PainelDoRh> {
  const hoje = hojeISO();
  const [linhas, cfg] = await Promise.all([linhasDoPainel(user, filters), listarConfigDasNomenclaturas()]);
  const { pendencias, resumo } = montarPendencias(linhas, hoje);
  const st = new Map<CertListItem['status'], number>();
  const nom = new Map<string, { rotulo: string; grupo: CertListItem['grupo']; count: number; days: number }>();
  for (const l of linhas) {
    st.set(l.status, (st.get(l.status) ?? 0) + 1);
    const n = nom.get(l.rotulo) ?? { rotulo: l.rotulo, grupo: l.grupo, count: 0, days: 0 };
    n.count++; n.days += l.days; nom.set(l.rotulo, n);
  }
  return {
    hoje, total: linhas.length, pendencias, resumo,
    porSituacao: [...st.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    porNomenclatura: [...nom.values()].sort((a, b) => b.count - a.count),
    nomenclaturas: { total: cfg.length, inativas: cfg.filter((c) => !c.active).length, comNomeNoRh: cfg.filter((c) => c.rhName).length },
    linhas,
  };
}
