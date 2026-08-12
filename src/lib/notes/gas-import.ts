import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { isSupervisory } from '@/lib/roles';
import type { SessionUser } from '@/lib/auth/session';

type Ctx = { ip?: string | null; userAgent?: string | null };

/**
 * Import em lote de notas de GÁS (XLSX) → GasReceipt. Camada única de
 * parsing/validação, usada pelo dry-run (prévia) e pela gravação transacional.
 * Alvo: alimentar a Análise de gás igual aos lançamentos manuais.
 */

export const MAX_ROWS = 1000;

/** Colunas do modelo (nome exato do cabeçalho). */
export const COLS = {
  empresa: 'Empresa',
  cnpj: 'CNPJ',
  fornecedorNome: 'Nome do fornecedor',
  cnpjFornecedor: 'CNPJ fornecedor',
  numero: 'Nº Nota Fiscal',
  emissao: 'Data de emissão',
  preco: 'Preço unitário',
  quantidade: 'Quantidade',
  vencimento: 'Vencimento do boleto',
  forma: 'Forma de recebimento',
} as const;
const REQUIRED_COLS = [COLS.empresa, COLS.cnpj, COLS.fornecedorNome, COLS.cnpjFornecedor, COLS.numero, COLS.emissao, COLS.preco, COLS.quantidade];
const OPTIONAL_COLS = [COLS.vencimento, COLS.forma];

export const FORMA_GRANEL = 'Granel (kg)';
export const FORMA_BOTIJAO = 'Botijão (P45)';

export function canImportGasNotes(user: SessionUser): boolean {
  return user.role === 'CEO' || isSupervisory(user.role); // Admin/CEO/Supervisor/Coordenador (Supervisão)
}

/* ───────── helpers de normalização/parse ───────── */
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
/**
 * Chave de CNPJ p/ casamento: 14 dígitos com zero à esquerda. Cobre o caso do
 * Excel/SheetJS ler o CNPJ como NÚMERO e comer o zero inicial
 * (ex.: 05336082000163 → 5336082000163). Aplicada nos dois lados da comparação.
 */
const cnpjKey = (s: unknown) => {
  const d = digits(s);
  return d && d.length < 14 ? d.padStart(14, '0') : d;
};
const normHeader = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Decimal aceitando vírgula ou ponto (e "1.234,56"). */
export function parseDecimal(v: unknown): number | null {
  if (isBlank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Data: serial do Excel OU 'DD/MM/AAAA' OU 'AAAA-MM-DD' → 'YYYY-MM-DD' (hora truncada). null se inválida. */
export function parseDateCell(v: unknown): string | null {
  if (isBlank(v)) return null;
  if (typeof v === 'number') {
    if (!(v > 0)) return null;
    const days = Math.floor(v); // trunca a hora
    const d = new Date((days - 25569) * 86400000); // 25569 = dias de 1899-12-30 a 1970-01-01
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const dd = +br[1], mm = +br[2], yy = +br[3];
    const d = new Date(Date.UTC(yy, mm - 1, dd, 12));
    if (d.getUTCFullYear() === yy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd) {
      return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    return null;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const yy = +iso[1], mm = +iso[2], dd = +iso[3];
    const d = new Date(Date.UTC(yy, mm - 1, dd, 12));
    if (d.getUTCFullYear() === yy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

/* ───────── tipos de resultado ───────── */
export type RowStatus = 'OK' | 'DUPLICADA' | 'ERRO';
export interface RowResolved {
  unitId: string; supplierId: string; operationalDate: string; noteNumber: string;
  quantityKg: number; pricePerKg: number; totalValue: number; dueDate: string | null;
  kind: 'BULK' | 'CYLINDER';
}
export interface RowResult {
  line: number; // nº da linha na planilha (dados começam na linha 2)
  status: RowStatus;
  motivo?: string;
  aviso?: string;
  preview: { empresa: string; cnpj: string; fornecedor: string; numero: string; emissao: string; quantidade: string; preco: string; forma: string };
  resolved?: RowResolved; // presente só quando status = OK (usado na gravação)
}
export interface ImportSummary { total: number; ok: number; duplicadas: number; erros: number }
export type ValidateResult =
  | { ok: false; missingColumns: string[] }
  | { ok: false; tooMany: number }
  | { ok: true; rows: RowResult[]; summary: ImportSummary };

/** Mapeia coluna canônica → chave real do cabeçalho (matching por nome normalizado). */
function buildColumnMap(sampleKeys: string[]): { map: Record<string, string>; missing: string[] } {
  const byNorm = new Map<string, string>();
  for (const k of sampleKeys) byNorm.set(normHeader(k), k);
  const map: Record<string, string> = {};
  const missing: string[] = [];
  for (const col of [...REQUIRED_COLS, ...OPTIONAL_COLS]) {
    const actual = byNorm.get(normHeader(col));
    if (actual) map[col] = actual;
    else if ((REQUIRED_COLS as readonly string[]).includes(col)) missing.push(col);
  }
  return { map, missing };
}

/**
 * Valida (dry-run) as linhas já parseadas do XLSX. Não grava nada.
 * `rows` = array de objetos com as CHAVES sendo os cabeçalhos originais da planilha.
 */
export async function validateGasImport(user: SessionUser, rows: Record<string, unknown>[]): Promise<ValidateResult> {
  if (rows.length > MAX_ROWS) return { ok: false, tooMany: rows.length };

  // Cabeçalho / colunas obrigatórias (união das chaves — XLSX pode vir esparso).
  const allKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const { map, missing } = buildColumnMap(allKeys);
  if (missing.length) return { ok: false, missingColumns: missing };
  const get = (r: Record<string, unknown>, col: string) => (map[col] ? r[map[col]] : undefined);

  // Cadastros para resolução (unidades no escopo do usuário; fornecedores globais).
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, select: { id: true, cnpj: true } });
  const unitByCnpj = new Map(units.filter((u) => u.cnpj).map((u) => [cnpjKey(u.cnpj), u.id]));
  const suppliers = await prisma.supplier.findMany({ where: { active: true }, select: { id: true, cnpj: true, isGas: true } });
  const supByCnpj = new Map(suppliers.filter((s) => s.cnpj).map((s) => [cnpjKey(s.cnpj), s]));

  const today = new Date().toISOString().slice(0, 10);
  const seenInFile = new Set<string>(); // dup dentro do arquivo (cnpj|cnpjForn|numero)
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    const empresa = String(get(r, COLS.empresa) ?? '').trim();
    const cnpjRaw = get(r, COLS.cnpj);
    const fornNome = String(get(r, COLS.fornecedorNome) ?? '').trim();
    const cnpjFornRaw = get(r, COLS.cnpjFornecedor);
    const numeroRaw = get(r, COLS.numero);
    const emissaoRaw = get(r, COLS.emissao);
    const precoRaw = get(r, COLS.preco);
    const qtdRaw = get(r, COLS.quantidade);
    const vencRaw = get(r, COLS.vencimento);
    const formaRaw = get(r, COLS.forma);

    // Linha totalmente vazia → ignora em silêncio.
    if ([cnpjRaw, cnpjFornRaw, numeroRaw, emissaoRaw, precoRaw, qtdRaw, empresa, fornNome].every(isBlank)) continue;

    const numero = numeroRaw == null ? '' : String(numeroRaw).trim(); // string, preserva zeros à esquerda
    const emissao = parseDateCell(emissaoRaw);
    const venc = isBlank(vencRaw) ? null : parseDateCell(vencRaw);
    const preco = parseDecimal(precoRaw);
    const qtd = parseDecimal(qtdRaw);
    const formaStr = String(formaRaw ?? '').trim();
    const preview = {
      empresa, cnpj: String(cnpjRaw ?? ''), fornecedor: fornNome, numero,
      emissao: emissao ?? String(emissaoRaw ?? ''), quantidade: qtd != null ? String(qtd) : String(qtdRaw ?? ''),
      preco: preco != null ? String(preco) : String(precoRaw ?? ''), forma: formaStr || FORMA_GRANEL,
    };
    const err = (motivo: string): RowResult => ({ line, status: 'ERRO', motivo, preview });

    // Duplicidade dentro do arquivo.
    const fileKey = `${cnpjKey(cnpjRaw)}|${cnpjKey(cnpjFornRaw)}|${numero}`;
    if (numero && seenInFile.has(fileKey)) { results.push(err('Duplicada no próprio arquivo')); continue; }

    // Validações.
    if (!numero) { results.push(err('Nº Nota Fiscal vazio')); continue; }
    const unitId = unitByCnpj.get(cnpjKey(cnpjRaw));
    if (!unitId) { results.push(err('Unidade não encontrada')); continue; }
    const sup = supByCnpj.get(cnpjKey(cnpjFornRaw));
    if (!sup) { results.push(err('Fornecedor não cadastrado (cadastre em Configurações → Fornecedores)')); continue; }
    if (!emissao) { results.push(err('Data de emissão inválida')); continue; }
    if (emissao > today) { results.push(err('Data de emissão futura')); continue; }
    if (!isBlank(vencRaw) && !venc) { results.push(err('Vencimento do boleto inválido')); continue; }
    if (venc && venc < emissao) { results.push(err('Vencimento anterior à emissão')); continue; }
    if (preco == null || !(preco > 0)) { results.push(err('Preço unitário deve ser maior que zero')); continue; }
    if (qtd == null || !(qtd > 0)) { results.push(err('Quantidade deve ser maior que zero')); continue; }
    let kind: 'BULK' | 'CYLINDER' = 'BULK';
    if (formaStr) {
      if (normHeader(formaStr) === normHeader(FORMA_GRANEL)) kind = 'BULK';
      else if (normHeader(formaStr) === normHeader(FORMA_BOTIJAO)) kind = 'CYLINDER';
      else { results.push(err(`Forma de recebimento inválida (use "${FORMA_GRANEL}" ou "${FORMA_BOTIJAO}")`)); continue; }
    }

    seenInFile.add(fileKey);
    const totalValue = Math.round(qtd * preco * 100) / 100;
    const pricePerKg = Math.round(preco * 10000) / 10000;
    results.push({
      line, status: 'OK', preview,
      aviso: !sup.isGas ? 'Fornecedor cadastrado NÃO é do tipo gás' : undefined,
      resolved: { unitId, supplierId: sup.id, operationalDate: emissao, noteNumber: numero, quantityKg: qtd, pricePerKg, totalValue, dueDate: venc, kind },
    });
  }

  // Idempotência no banco: já existe GasReceipt (unitId, supplierId, noteNumber) → Duplicada.
  const okRows = results.filter((r) => r.status === 'OK' && r.resolved);
  if (okRows.length) {
    const existing = await prisma.gasReceipt.findMany({
      where: { OR: okRows.map((r) => ({ unitId: r.resolved!.unitId, supplierId: r.resolved!.supplierId, noteNumber: r.resolved!.noteNumber })) },
      select: { unitId: true, supplierId: true, noteNumber: true },
    });
    const dbKeys = new Set(existing.map((e) => `${e.unitId}|${e.supplierId}|${e.noteNumber}`));
    for (const r of okRows) {
      const k = `${r.resolved!.unitId}|${r.resolved!.supplierId}|${r.resolved!.noteNumber}`;
      if (dbKeys.has(k)) { r.status = 'DUPLICADA'; r.motivo = 'Já existe nota com esta unidade + fornecedor + número'; delete r.resolved; }
    }
  }

  const summary: ImportSummary = {
    total: results.length,
    ok: results.filter((r) => r.status === 'OK').length,
    duplicadas: results.filter((r) => r.status === 'DUPLICADA').length,
    erros: results.filter((r) => r.status === 'ERRO').length,
  };
  return { ok: true, rows: results, summary };
}

/* ───────── gravação transacional ───────── */
export interface CommitResult { batchId: string; imported: number; duplicadas: number; erros: number; rows: RowResult[] }
export type CommitOutcome =
  | { ok: false; missingColumns: string[] }
  | { ok: false; tooMany: number }
  | { ok: true; result: CommitResult };

/**
 * Revalida e grava SÓ as linhas OK, numa única transação, com importBatchId.
 * `createMany({ skipDuplicates })` respeita o unique index (idempotência mesmo em corrida).
 */
export async function commitGasImport(user: SessionUser, rows: Record<string, unknown>[], ctx: Ctx = {}): Promise<CommitOutcome> {
  const v = await validateGasImport(user, rows);
  if (!v.ok) return v;

  const batchId = randomUUID();
  const okRows = v.rows.filter((r) => r.status === 'OK' && r.resolved);
  const data = okRows.map((r) => {
    const z = r.resolved!;
    const isCyl = z.kind === 'CYLINDER';
    return {
      unitId: z.unitId, supplierId: z.supplierId, operationalDate: z.operationalDate, noteNumber: z.noteNumber,
      quantityKg: z.quantityKg, totalValue: z.totalValue, pricePerKg: z.pricePerKg,
      dueDate: z.dueDate ? new Date(`${z.dueDate}T12:00:00Z`) : null,
      kind: z.kind, cylinderKg: isCyl ? 45 : null, cylinderCount: isCyl ? Math.max(1, Math.round(z.quantityKg / 45)) : null,
      createdById: user.id, importBatchId: batchId,
    };
  });

  let imported = 0;
  if (data.length) {
    imported = await prisma.$transaction(async (tx) => (await tx.gasReceipt.createMany({ data, skipDuplicates: true })).count);
    // Reconcilia: OK que NÃO entraram (corrida) → Duplicada na resposta.
    const inserted = await prisma.gasReceipt.findMany({ where: { importBatchId: batchId }, select: { unitId: true, supplierId: true, noteNumber: true } });
    const insertedKeys = new Set(inserted.map((e) => `${e.unitId}|${e.supplierId}|${e.noteNumber}`));
    for (const r of okRows) {
      const k = `${r.resolved!.unitId}|${r.resolved!.supplierId}|${r.resolved!.noteNumber}`;
      if (!insertedKeys.has(k)) { r.status = 'DUPLICADA'; r.motivo = 'Já existente (detectado na gravação)'; delete r.resolved; }
    }
  }

  const result: CommitResult = {
    batchId, imported,
    duplicadas: v.rows.filter((r) => r.status === 'DUPLICADA').length,
    erros: v.rows.filter((r) => r.status === 'ERRO').length,
    rows: v.rows,
  };
  await audit({ userId: user.id, action: 'GAS_IMPORT_BATCH', module: 'GAS', entity: 'gas_receipt', metadata: { batchId, imported, duplicadas: result.duplicadas, erros: result.erros }, ...ctx });
  return { ok: true, result };
}
