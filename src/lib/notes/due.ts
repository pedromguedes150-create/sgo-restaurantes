import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { notifySupervisory, notifyRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Acompanhamento de VENCIMENTOS das notas (item 23/07). Objetivo único: alertar a
 * supervisão (SUPERVISOR+COORDINATOR+ADMIN) e o Financeiro dos boletos que estão
 * PARA VENCER — os vencidos/pagos são controlados pelo Financeiro (Teknisa).
 * Inclui as notas comuns (ReceivedNote) e os recebimentos de gás (GasReceipt),
 * já que o gás passou a ser lançado como nota.
 */

export interface DueRow {
  id: string;
  kind: 'NOTE' | 'GAS';
  unitId: string;
  unit: string;
  supplier: string;
  value: number;
  dueDate: string; // YYYY-MM-DD
  daysToDue: number; // <0 = vencido
  number: string | null;
  /** Parcela do boleto, quando a nota é parcelada: 2 de 3. Nulo em boleto único. */
  installment?: { seq: number; of: number } | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (fromISO: string, toISO: string) => Math.round((new Date(`${toISO}T00:00:00`).getTime() - new Date(`${fromISO}T00:00:00`).getTime()) / 86400000);

export interface DueFilters { unitId?: string; supplierName?: string; daysAhead?: number; includeOverdue?: boolean }

/**
 * Notas/gás com vencimento dentro da janela (padrão 30 dias à frente).
 * includeOverdue mostra também os já vencidos (para conferência), mas o foco é o futuro.
 */
export async function getUpcomingDues(user: SessionUser, f: DueFilters = {}): Promise<DueRow[]> {
  const daysAhead = f.daysAhead && f.daysAhead > 0 ? Math.min(365, f.daysAhead) : 30;
  const today = new Date();
  const todayISO = iso(today);
  const horizon = new Date(today.getTime() + daysAhead * 86400000);
  // limite inferior: vencidos só se pedido (ex.: últimos 90d), senão a partir de hoje
  const lower = f.includeOverdue ? new Date(today.getTime() - 90 * 86400000) : today;

  const unitFilter = f.unitId ? { unitId: f.unitId } : unitScopeWhere(user, 'unitId');

  const [notes, parcelas, gas] = await Promise.all([
    /* Duas buscas de nota, de propósito:
       - a primeira pega as notas de BOLETO ÚNICO pelo dueDate, como sempre;
       - a segunda pega as PARCELAS dentro da janela, cada uma virando sua
         própria linha. Sem isso, a nota parcelada aparecia uma vez só, com o
         vencimento do primeiro boleto, e o 2º e o 3º nunca eram cobrados. */
    prisma.receivedNote.findMany({
      where: {
        ...unitFilter,
        dueDate: { gte: lower, lte: horizon },
        status: { in: ['RECEIVED', 'PROBLEM'] },
        installments: { none: {} },
      },
      select: { id: true, unitId: true, unit: { select: { name: true } }, supplierName: true, totalValue: true, dueDate: true, number: true },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.noteInstallment.findMany({
      where: {
        dueDate: { gte: lower, lte: horizon },
        note: { ...unitFilter, status: { in: ['RECEIVED', 'PROBLEM'] } },
      },
      select: {
        id: true, seq: true, dueDate: true, value: true,
        note: {
          select: {
            id: true, unitId: true, number: true, supplierName: true,
            unit: { select: { name: true } },
            _count: { select: { installments: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.gasReceipt.findMany({
      where: { ...unitFilter, dueDate: { gte: lower, lte: horizon } },
      select: { id: true, unitId: true, unit: { select: { name: true } }, supplier: { select: { name: true } }, totalValue: true, dueDate: true, noteNumber: true },
      orderBy: { dueDate: 'asc' },
    }),
  ]);

  const rows: DueRow[] = [
    ...notes.map((n) => ({
      id: n.id, kind: 'NOTE' as const, unitId: n.unitId, unit: n.unit.name, supplier: n.supplierName,
      value: Number(n.totalValue), dueDate: iso(n.dueDate!), daysToDue: daysBetween(todayISO, iso(n.dueDate!)), number: n.number,
    })),
    ...parcelas.map((p) => ({
      /* id da PARCELA, não da nota: duas parcelas da mesma nota são duas linhas
         distintas e precisam de chave distinta na tela. */
      id: p.id, kind: 'NOTE' as const, unitId: p.note.unitId, unit: p.note.unit.name, supplier: p.note.supplierName,
      value: Number(p.value), dueDate: iso(p.dueDate), daysToDue: daysBetween(todayISO, iso(p.dueDate)), number: p.note.number,
      installment: { seq: p.seq, of: p.note._count.installments },
    })),
    ...gas.map((g) => ({
      id: g.id, kind: 'GAS' as const, unitId: g.unitId, unit: g.unit.name, supplier: g.supplier?.name ?? 'Gás',
      value: Number(g.totalValue), dueDate: iso(g.dueDate!), daysToDue: daysBetween(todayISO, iso(g.dueDate!)), number: g.noteNumber,
    })),
  ];

  const bySupplier = f.supplierName ? rows.filter((r) => r.supplier === f.supplierName) : rows;
  return bySupplier.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface DueContext { unitId: string; supplierNames: string[] }
/** Metadados para os filtros da tela (unidades acessíveis + fornecedores presentes). */
export async function getDueFilterOptions(user: SessionUser): Promise<{ units: { id: string; name: string }[]; suppliers: string[] }> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const rows = await getUpcomingDues(user, { daysAhead: 365, includeOverdue: true });
  const suppliers = [...new Set(rows.map((r) => r.supplier))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { units, suppliers };
}

/**
 * Scheduler: alerta a supervisão e o Financeiro dos boletos que vencem em ≤ N dias
 * e que ainda não foram alertados. Marca dueAlertedAt para não repetir.
 * Roda 1×/dia (ver instrumentation.ts). ALERT_DAYS padrão = 3.
 */
const ALERT_DAYS = 3;

export async function notifyUpcomingDueNotes(): Promise<{ notes: number; gas: number; units: number }> {
  const today = new Date();
  const limit = new Date(today.getTime() + ALERT_DAYS * 86400000);

  const [notes, parcelas, gas] = await Promise.all([
    prisma.receivedNote.findMany({
      where: {
        dueDate: { gte: today, lte: limit }, dueAlertedAt: null,
        status: { in: ['RECEIVED', 'PROBLEM'] },
        installments: { none: {} },
      },
      select: { id: true, unitId: true, unit: { select: { name: true } }, supplierName: true, totalValue: true, dueDate: true },
    }),
    /* Cada boleto avisa por si. Com o controle na nota, o aviso do 1º silenciaria
       o 2º e o 3º — e eles venceriam sem ninguém saber. */
    prisma.noteInstallment.findMany({
      where: {
        dueDate: { gte: today, lte: limit }, alertedAt: null,
        note: { status: { in: ['RECEIVED', 'PROBLEM'] } },
      },
      select: {
        id: true, seq: true, dueDate: true, value: true,
        note: { select: { unitId: true, supplierName: true, unit: { select: { name: true } }, _count: { select: { installments: true } } } },
      },
    }),
    prisma.gasReceipt.findMany({
      where: { dueDate: { gte: today, lte: limit }, dueAlertedAt: null },
      select: { id: true, unitId: true, unit: { select: { name: true } }, supplier: { select: { name: true } }, totalValue: true, dueDate: true },
    }),
  ]);

  if (notes.length === 0 && parcelas.length === 0 && gas.length === 0) return { notes: 0, gas: 0, units: 0 };

  // agrupa por unidade
  const byUnit = new Map<string, { unitName: string; items: { supplier: string; value: number; dueDate: Date }[] }>();
  for (const n of notes) {
    const g = byUnit.get(n.unitId) ?? { unitName: n.unit.name, items: [] };
    g.items.push({ supplier: n.supplierName, value: Number(n.totalValue), dueDate: n.dueDate! });
    byUnit.set(n.unitId, g);
  }
  for (const p of parcelas) {
    const g = byUnit.get(p.note.unitId) ?? { unitName: p.note.unit.name, items: [] };
    g.items.push({
      supplier: `${p.note.supplierName} (parcela ${p.seq}/${p.note._count.installments})`,
      value: Number(p.value), dueDate: p.dueDate,
    });
    byUnit.set(p.note.unitId, g);
  }
  for (const r of gas) {
    const g = byUnit.get(r.unitId) ?? { unitName: r.unit.name, items: [] };
    g.items.push({ supplier: r.supplier?.name ?? 'Gás', value: Number(r.totalValue), dueDate: r.dueDate! });
    byUnit.set(r.unitId, g);
  }

  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  for (const [unitId, g] of byUnit) {
    const total = g.items.reduce((s, x) => s + x.value, 0);
    const body = `${g.unitName}: ${g.items.length} boleto(s) vencendo em até ${ALERT_DAYS} dias (${brl(total)}). Ex.: ${g.items.slice(0, 3).map((x) => `${x.supplier} ${brl(x.value)} (${x.dueDate.toLocaleDateString('pt-BR')})`).join('; ')}. Avise o financeiro para não vencer.`;
    const payload = { title: '📅 Boletos a vencer', body, link: '/modulos/notas', module: 'NOTES' as const };
    await notifySupervisory(payload, unitId).catch(() => {});
  }

  // Financeiro recebe um resumo geral (controla o pagamento)
  const totalItems = notes.length + parcelas.length + gas.length;
  const grand =
    [...notes, ...gas].reduce((s, x) => s + Number(x.totalValue), 0) +
    parcelas.reduce((s, p) => s + Number(p.value), 0);
  await notifyRole('FINANCE', {
    title: '📅 Boletos a vencer (rede)',
    body: `${totalItems} boleto(s) vencendo em até ${ALERT_DAYS} dias — total ${brl(grand)}. Confira o acompanhamento de vencimentos em Notas Recebidas.`,
    link: '/modulos/notas', module: 'NOTES',
  }).catch(() => {});

  const now = new Date();
  if (notes.length) await prisma.receivedNote.updateMany({ where: { id: { in: notes.map((n) => n.id) } }, data: { dueAlertedAt: now } });
  if (parcelas.length) await prisma.noteInstallment.updateMany({ where: { id: { in: parcelas.map((p) => p.id) } }, data: { alertedAt: now } });
  if (gas.length) await prisma.gasReceipt.updateMany({ where: { id: { in: gas.map((g) => g.id) } }, data: { dueAlertedAt: now } });

  return { notes: notes.length + parcelas.length, gas: gas.length, units: byUnit.size };
}

/** Verifica acesso à unidade (para a rota da API). */
export function canSeeUnitDues(user: SessionUser, unitId: string): boolean {
  return canAccessUnit(user, unitId);
}
