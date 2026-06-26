import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export interface ParsedRow {
  couponNumber: string;
  cashOperator: string | null;
  value: number;
}

/** Converte valor BR ("1.234,56" / "1234,56" / "1234.56") em número. */
export function parseBRNumber(raw: string): number {
  const s = (raw ?? '').replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s) || 0;
}

const COUPON_KEYS = ['nr. nota', 'nota', 'cupom', 'comanda', 'documento', 'coo', 'ccf', 'numero', 'número', 'cupom fiscal'];
const OPERATOR_KEYS = ['operador', 'caixa', 'usuario', 'usuário', 'vendedor'];
const VALUE_KEYS = ['vr. venda', 'venda', 'valor', 'total', 'vlr', 'montante'];

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  return parseBRNumber(String(v ?? '0'));
}

/**
 * Parser da planilha (.xlsx) do Teknisa "Relação de Cupons SAT/NFC-e".
 * Traz só o básico: número do cupom (Nr. Nota) e valor (Vr. Venda + Acrés + Desc).
 * Ignora linhas de subtotal/total e linhas sem número de cupom.
 */
export function parseTeknisaSheet(matrix: unknown[][]): { rows: ParsedRow[]; mapped: boolean } {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  let hi = -1;
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const cells = (matrix[i] ?? []).map(norm);
    const hasCoupon = cells.some((c) => c.includes('nota') || c.includes('cupom') || c.includes('documento'));
    const hasValue = cells.some((c) => c.includes('venda') || c.includes('valor'));
    if (hasCoupon && hasValue) { hi = i; break; }
  }
  if (hi === -1) return { rows: [], mapped: false };

  const headers = (matrix[hi] ?? []).map(norm);
  const idxOf = (...keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));
  const couponIdx = idxOf('nr. nota', 'nota', 'cupom', 'documento', 'coo');
  const vendaIdx = idxOf('vr. venda', 'venda', 'valor');
  const acresIdx = idxOf('acrés', 'acres');
  const descIdx = idxOf('desc');
  const caixaIdx = idxOf('caixa');
  if (couponIdx === -1 || vendaIdx === -1) return { rows: [], mapped: false };

  const rows: ParsedRow[] = [];
  for (let i = hi + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const first = norm(row[caixaIdx >= 0 ? caixaIdx : 0]);
    if (first.startsWith('total')) continue; // subtotal/total
    const coupon = String(row[couponIdx] ?? '').trim();
    if (!coupon || /^total/i.test(coupon)) continue;
    const value = num(row[vendaIdx]) + (acresIdx >= 0 ? num(row[acresIdx]) : 0) + (descIdx >= 0 ? num(row[descIdx]) : 0);
    rows.push({ couponNumber: coupon, cashOperator: null, value: Math.round(value * 100) / 100 });
  }
  return { rows, mapped: rows.length > 0 };
}

function findIndex(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => keys.some((k) => h.includes(k)));
}

/**
 * Parser CSV genérico do relatório Teknisa (Módulo 4).
 * Detecta delimitador (; ou ,) e mapeia colunas por nome de cabeçalho (PT-BR).
 * (PDF/Excel ficam para refino quando houver amostra real.)
 */
export function parseCancellationsCsv(text: string): { rows: ParsedRow[]; mapped: boolean } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], mapped: false };

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());

  const ci = findIndex(headers, COUPON_KEYS);
  const oi = findIndex(headers, OPERATOR_KEYS);
  const vi = findIndex(headers, VALUE_KEYS);
  if (ci === -1 || vi === -1) return { rows: [], mapped: false };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    const couponNumber = (cols[ci] ?? '').trim();
    if (!couponNumber) continue;
    rows.push({
      couponNumber,
      cashOperator: oi >= 0 ? (cols[oi] ?? '').trim() || null : null,
      value: parseBRNumber(cols[vi] ?? '0'),
    });
  }
  return { rows, mapped: true };
}

export type ImportResult =
  | { ok: true; importId: string; created: number; operationalDate: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'EMPTY' };

/** Importa um relatório de cancelamentos (Admin). Cada linha vira pendência. */
export async function importCancellations(
  user: SessionUser,
  input: { unitId: string; operationalDate?: string; fileName: string; rows: ParsedRow[] },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ImportResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const rows = input.rows;
  if (rows.length === 0) return { ok: false, reason: 'EMPTY' };

  const operationalDate =
    input.operationalDate ?? currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });

  // Reimportação não pode duplicar pendências: ignora cupons que já existem
  // para esta unidade/dia (qualquer status — justificados permanecem intactos).
  const existing = await prisma.cancellation.findMany({
    where: { unitId: unit.id, operationalDate, couponNumber: { in: rows.map((r) => r.couponNumber) } },
    select: { couponNumber: true },
  });
  const seen = new Set(existing.map((e) => e.couponNumber));
  const fresh = rows.filter((r) => {
    if (seen.has(r.couponNumber)) return false;
    seen.add(r.couponNumber); // dedup também dentro do próprio arquivo
    return true;
  });
  const skipped = rows.length - fresh.length;
  if (fresh.length === 0) return { ok: false, reason: 'EMPTY' };

  const imp = await prisma.cancellationImport.create({
    data: {
      unitId: unit.id,
      operationalDate,
      fileName: input.fileName,
      rowCount: fresh.length,
      importedById: user.id,
      cancellations: {
        create: fresh.map((r) => ({
          unitId: unit.id,
          operationalDate,
          couponNumber: r.couponNumber,
          cashOperator: r.cashOperator,
          value: r.value,
        })),
      },
    },
  });

  await audit({
    userId: user.id,
    unitId: unit.id,
    action: 'CANCELLATION_IMPORT',
    module: 'CANCELLATIONS',
    entity: 'cancellation_import',
    entityId: imp.id,
    metadata: { operationalDate, rows: fresh.length, skipped, fileName: input.fileName },
    ...ctx,
  });

  return { ok: true, importId: imp.id, created: fresh.length, operationalDate };
}
