import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export interface OpenCmdItem { name: string; qty: number; value: number }
export interface OpenCmd { number: string; openedAt: string | null; openedDate: string | null; value: number; items: OpenCmdItem[] }
export interface OpenCmdSuspect extends OpenCmd { daysOpen: number }

function num(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  // Teknisa usa PONTO como decimal (ex.: "162.652"). Se vier vírgula (export BR), trata como decimal BR.
  const cleaned = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Faz o parse do relatório "Comandas em Aberto" (Teknisa). Cada comanda tem N
 * linhas de item e uma linha "Total (Comanda:NNNN - Data abert.: DD/MM/AAAA HH:MM:SS ...)".
 */
export function parseOpenCommands(buffer: Buffer): OpenCmd[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
  const out: OpenCmd[] = [];
  let items: OpenCmdItem[] = [];
  const totalRe = /Comanda:\s*(\d+)[\s\S]*?Data abert\.?:\s*(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/i;
  for (const r of rows) {
    const first = String(r?.[0] ?? '');
    const m = totalRe.exec(first);
    if (m) {
      const [dd, mm, yyyy] = m[2].split('/');
      const openedDate = `${yyyy}-${mm}-${dd}`;
      const openedAt = m[3] ? `${openedDate}T${m[3]}` : openedDate;
      const value = num(r[r.length - 1]);
      out.push({ number: m[1], openedAt, openedDate, value, items });
      items = [];
    } else if (first && !/^produto$/i.test(first.trim()) && String(r?.[1] ?? '').trim() !== '' && !/^total/i.test(first.trim())) {
      // linha de item: Produto | Quantidade | Vr.Unit | Desconto | Acréscimo | Vr.Total
      const value = num(r[5] ?? r[r.length - 1]);
      const qty = num(r[1]);
      items.push({ name: first.replace(/^\d+\s*/, '').trim(), qty, value });
    }
  }
  return out;
}

/** Suspeitas = comanda ABERTA com valor > 0 e data de abertura ANTERIOR ao corte. */
export function analyzeOpenCommands(commands: OpenCmd[], cutDateISO: string): { suspects: OpenCmdSuspect[]; total: number; suspectValue: number } {
  const cut = new Date(`${cutDateISO}T00:00:00`);
  const suspects: OpenCmdSuspect[] = [];
  for (const c of commands) {
    if (!c.openedDate || c.value <= 0) continue;
    if (c.openedDate >= cutDateISO) continue; // aberta hoje/no futuro = ok
    const daysOpen = Math.max(1, Math.round((cut.getTime() - new Date(`${c.openedDate}T00:00:00`).getTime()) / 86400000));
    suspects.push({ ...c, daysOpen });
  }
  suspects.sort((a, b) => b.daysOpen - a.daysOpen || b.value - a.value);
  return { suspects, total: commands.length, suspectValue: Math.round(suspects.reduce((s, x) => s + x.value, 0) * 100) / 100 };
}

export async function saveOpenCommandAnalysis(
  user: SessionUser, unitId: string, buffer: Buffer, fileName: string | undefined, cutDateISO: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ ok: true; id: string; suspectCount: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' }> {
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  let commands: OpenCmd[] = [];
  try { commands = parseOpenCommands(buffer); } catch { return { ok: false, reason: 'INVALID' }; }
  if (commands.length === 0) return { ok: false, reason: 'INVALID' };
  const { suspects, total, suspectValue } = analyzeOpenCommands(commands, cutDateISO);
  const rec = await prisma.openCommandAnalysis.create({
    data: {
      unitId, createdById: user.id, createdByName: user.name, cutDate: cutDateISO, fileName: fileName ?? null,
      totalCommands: total, suspectCount: suspects.length, suspectValue,
      suspects: suspects as unknown as object,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId, action: 'OPEN_CMD_ANALYSIS', module: 'COMMANDS', entity: 'open_command_analysis', entityId: rec.id, metadata: { total, suspects: suspects.length, suspectValue }, ...ctx });
  return { ok: true, id: rec.id, suspectCount: suspects.length };
}

export async function listOpenCommandAnalyses(user: SessionUser, unitId: string) {
  if (!canAccessUnit(user, unitId)) return [];
  return prisma.openCommandAnalysis.findMany({ where: { unitId }, orderBy: { createdAt: 'desc' }, take: 30 });
}

export async function getOpenCommandAnalysis(user: SessionUser, id: string) {
  const a = await prisma.openCommandAnalysis.findUnique({ where: { id } });
  if (!a || !canAccessUnit(user, a.unitId)) return null;
  return a;
}

/**
 * Consolidado da REDE (para o Administrativo): junta a análise MAIS RECENTE de
 * cada unidade e lista os números das comandas a TRAVAR, por unidade e data.
 */
export async function getNetworkLockConsolidation(user: SessionUser) {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const out: { unitId: string; unitName: string; cutDate: string; createdAt: string; suspects: OpenCmdSuspect[]; suspectValue: number }[] = [];
  for (const u of units) {
    const a = await prisma.openCommandAnalysis.findFirst({ where: { unitId: u.id }, orderBy: { createdAt: 'desc' } });
    if (!a || a.suspectCount === 0) continue;
    out.push({ unitId: u.id, unitName: u.name, cutDate: a.cutDate, createdAt: a.createdAt.toISOString(), suspects: (a.suspects as unknown as OpenCmdSuspect[]) ?? [], suspectValue: Number(a.suspectValue) });
  }
  return out;
}
