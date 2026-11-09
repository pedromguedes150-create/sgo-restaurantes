import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { canSeeCid } from '@/lib/certificates/labels';
import { grupoDoDocumento, rotuloDoDocumento, alertaDeDuracao, type GrupoDoDocumento } from '@/lib/certificates/catalogo';
import type { SessionUser } from '@/lib/auth/session';
import type { CertificateType, DocumentGroup, DocumentStatus } from '@prisma/client';

export interface CertListItem {
  id: string;
  unitId: string;
  unitName: string;
  collaboratorName: string;
  type: CertificateType;
  /** v1.196.0 — grupo e nomenclatura do catálogo (nulos nos registros antigos) + o rótulo pronto. */
  documentGroup: DocumentGroup | null;
  nomenclature: string | null;
  rotulo: string;
  grupo: GrupoDoDocumento;
  status: DocumentStatus;
  statusNote: string | null;
  statusAt: string | null;
  /** "INSS" quando o afastamento passa de 15 dias (alerta, não decisão). */
  alerta: 'INSS' | null;
  /** O nome lido pela IA destoou do colaborador escolhido (vai para o RH conferir). */
  nomeDivergente: boolean;
  issueDate: string | null;
  startDate: string;
  endDate: string;
  days: number;
  hours: number | null;
  doctorName: string | null;
  doctorCrm: string | null;
  cid: string | null; // já mascarado conforme o perfil
  cidDescription: string | null; // sensível como o CID — só ADMIN/CEO
  attachmentPath: string | null;
  observation: string | null;
  by: string | null;
}

/** Lista de atestados no escopo do usuário. Mascara o CID p/ não-RH (LGPD). */
export async function listCertificates(
  user: SessionUser,
  filters: { unitId?: string; from?: string; to?: string } = {},
): Promise<CertListItem[]> {
  const showCid = canSeeCid(user.role);
  const rows = await prisma.medicalCertificate.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      unit: { active: true },
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.from || filters.to
        ? { startDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    take: 300,
    include: {
      unit: { select: { name: true } },
      collaborator: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((r) => {
    const ai = (r.aiExtracted && typeof r.aiExtracted === 'object' ? r.aiExtracted : {}) as { conferenciaDoNome?: { divergente?: boolean } };
    return {
    id: r.id,
    unitId: r.unitId,
    unitName: r.unit.name,
    collaboratorName: r.collaborator.name,
    type: r.type,
    documentGroup: r.documentGroup,
    nomenclature: r.nomenclature,
    rotulo: rotuloDoDocumento(r),
    grupo: grupoDoDocumento(r),
    status: r.status,
    statusNote: r.statusNote,
    statusAt: r.statusAt ? r.statusAt.toISOString() : null,
    alerta: alertaDeDuracao(r),
    nomeDivergente: ai.conferenciaDoNome?.divergente === true,
    issueDate: r.issueDate,
    startDate: r.startDate,
    endDate: r.endDate,
    days: r.days,
    hours: r.hours != null ? Number(r.hours) : null,
    doctorName: r.doctorName,
    doctorCrm: r.doctorCrm,
    cid: showCid ? r.cid : (r.cid ? '•••' : null),
    cidDescription: showCid ? r.cidDescription : null,
    attachmentPath: r.attachmentPath,
    observation: r.observation,
    by: r.createdBy?.name ?? null,
    };
  });
}

export interface CertReport {
  period: { from: string; to: string };
  totals: { count: number; days: number };
  byUnit: { unitId: string; unitName: string; count: number; days: number; headcount: number; absenteeismPct: number }[];
  monthlyTrend: { ym: string; count: number; days: number }[];
  byWeekday: { weekday: number; label: string; count: number }[];
  byType: { type: CertificateType; count: number; days: number }[];
  /** v1.196.0 — por grupo e por nomenclatura (registros antigos entram pelo tipo de sempre). */
  byGroup: { grupo: GrupoDoDocumento; count: number; days: number }[];
  byNomenclature: { rotulo: string; grupo: GrupoDoDocumento; count: number; days: number }[];
  /** v1.196.0 — quantos lançamentos do mês estão em cada situação. */
  byStatus: { status: DocumentStatus; count: number }[];
}

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function weekdayOf(date: string): number { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function daysInMonth(ym: string): number { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Relatório/dashboard de atestados de um mês (yyyy-mm). */
export async function getCertificatesReport(user: SessionUser, ym: string): Promise<CertReport> {
  const from = `${ym}-01`;
  const to = `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;

  const rows = await prisma.medicalCertificate.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), unit: { active: true }, startDate: { gte: from, lte: to } },
    select: { unitId: true, unit: { select: { name: true } }, startDate: true, days: true, type: true, documentGroup: true, nomenclature: true, status: true },
  });

  // Totais e por unidade
  const totals = { count: rows.length, days: rows.reduce((s, r) => s + r.days, 0) };
  const unitMap = new Map<string, { unitId: string; unitName: string; count: number; days: number }>();
  for (const r of rows) {
    const u = unitMap.get(r.unitId) ?? { unitId: r.unitId, unitName: r.unit.name, count: 0, days: 0 };
    u.count += 1; u.days += r.days; unitMap.set(r.unitId, u);
  }
  // Headcount (colaboradores ativos vinculados) para a taxa de absenteísmo
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    select: { id: true, name: true, _count: { select: { collaboratorUnits: { where: { collaborator: { active: true } } } } } },
  });
  const headByUnit = new Map(units.map((u) => [u.id, u._count.collaboratorUnits]));
  const dim = daysInMonth(ym);
  const byUnit = [...unitMap.values()].map((u) => {
    const headcount = headByUnit.get(u.unitId) ?? 0;
    const denom = headcount * dim;
    return { ...u, headcount, absenteeismPct: denom > 0 ? Math.round((u.days / denom) * 1000) / 10 : 0 };
  }).sort((a, b) => b.days - a.days);

  // Por dia da semana
  const wdCount = new Array(7).fill(0);
  for (const r of rows) wdCount[weekdayOf(r.startDate)] += 1;
  const byWeekday = wdCount.map((count, weekday) => ({ weekday, label: WD[weekday], count }));

  // Por tipo
  const typeMap = new Map<CertificateType, { type: CertificateType; count: number; days: number }>();
  for (const r of rows) {
    const t = typeMap.get(r.type) ?? { type: r.type, count: 0, days: 0 };
    t.count += 1; t.days += r.days; typeMap.set(r.type, t);
  }
  const byType = [...typeMap.values()];

  // Por grupo, por nomenclatura e por situação (v1.196.0)
  const groupMap = new Map<GrupoDoDocumento, { grupo: GrupoDoDocumento; count: number; days: number }>();
  const nomMap = new Map<string, { rotulo: string; grupo: GrupoDoDocumento; count: number; days: number }>();
  const stMap = new Map<DocumentStatus, { status: DocumentStatus; count: number }>();
  for (const r of rows) {
    const grupo = grupoDoDocumento(r);
    const g = groupMap.get(grupo) ?? { grupo, count: 0, days: 0 };
    g.count += 1; g.days += r.days; groupMap.set(grupo, g);
    const rotulo = rotuloDoDocumento(r);
    const n = nomMap.get(rotulo) ?? { rotulo, grupo, count: 0, days: 0 };
    n.count += 1; n.days += r.days; nomMap.set(rotulo, n);
    const s = stMap.get(r.status) ?? { status: r.status, count: 0 };
    s.count += 1; stMap.set(r.status, s);
  }
  const byGroup = [...groupMap.values()].sort((a, b) => b.count - a.count);
  const byNomenclature = [...nomMap.values()].sort((a, b) => b.count - a.count);
  const byStatus = [...stMap.values()].sort((a, b) => b.count - a.count);

  // Tendência dos últimos 12 meses (do ym para trás)
  const [yy, mm] = ym.split('-').map(Number);
  const trendFrom = new Date(Date.UTC(yy, mm - 12, 1));
  const tf = `${trendFrom.getUTCFullYear()}-${String(trendFrom.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const trendRows = await prisma.medicalCertificate.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), unit: { active: true }, startDate: { gte: tf, lte: to } },
    select: { startDate: true, days: true },
  });
  const trendMap = new Map<string, { ym: string; count: number; days: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(yy, mm - 1 - i, 1));
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    trendMap.set(k, { ym: k, count: 0, days: 0 });
  }
  for (const r of trendRows) {
    const k = r.startDate.slice(0, 7);
    const t = trendMap.get(k);
    if (t) { t.count += 1; t.days += r.days; }
  }
  const monthlyTrend = [...trendMap.values()];

  return { period: { from, to }, totals, byUnit, monthlyTrend, byWeekday, byType, byGroup, byNomenclature, byStatus };
}
