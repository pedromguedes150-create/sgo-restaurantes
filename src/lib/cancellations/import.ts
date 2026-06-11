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

const COUPON_KEYS = ['cupom', 'comanda', 'documento', 'coo', 'ccf', 'numero', 'número', 'cupom fiscal'];
const OPERATOR_KEYS = ['operador', 'caixa', 'usuario', 'usuário', 'vendedor'];
const VALUE_KEYS = ['valor', 'total', 'vlr', 'montante'];

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
  input: { unitId: string; operationalDate?: string; fileName: string; csv: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ImportResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const { rows, mapped } = parseCancellationsCsv(input.csv);
  if (!mapped) return { ok: false, reason: 'INVALID' };
  if (rows.length === 0) return { ok: false, reason: 'EMPTY' };

  const operationalDate =
    input.operationalDate ?? currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });

  const imp = await prisma.cancellationImport.create({
    data: {
      unitId: unit.id,
      operationalDate,
      fileName: input.fileName,
      rowCount: rows.length,
      importedById: user.id,
      cancellations: {
        create: rows.map((r) => ({
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
    metadata: { operationalDate, rows: rows.length, fileName: input.fileName },
    ...ctx,
  });

  return { ok: true, importId: imp.id, created: rows.length, operationalDate };
}
