/**
 * Lógica de datas do DatePicker (Onda 2) — pura, sem React, para ser testável.
 * Tudo em 'AAAA-MM-DD' (mesma convenção de data operacional do projeto) e as
 * contas em UTC sobre y/m/d puros: assim o fuso do navegador nunca desloca o dia.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function parseISO(s: string | null | undefined): { y: number; m: number; d: number } | null {
  const mt = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!mt) return null;
  const y = +mt[1], m = +mt[2], d = +mt[3];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** m é 1-based. O dia 0 do mês seguinte é o último dia deste mês. */
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 0 = domingo. */
export const firstWeekday = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).getUTCDay();

export function addDays(iso: string, n: number): string {
  const p = parseISO(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Trocar de mês nunca "vaza" para o mês seguinte: 31/jan -1 mês = 28/fev. */
export function addMonths(iso: string, n: number): string {
  const p = parseISO(iso);
  if (!p) return iso;
  const total = p.m - 1 + n;
  const y = p.y + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12 + 1;
  return toISO(y, m, Math.min(p.d, daysInMonth(y, m)));
}

export function formatBr(iso: string | null | undefined): string {
  const p = parseISO(iso);
  return p ? `${pad(p.d)}/${pad(p.m)}/${p.y}` : '';
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
