/**
 * Lógica de horário do TimePicker (Onda 6) — pura, sem React, para ser testável.
 * Tudo em 'HH:MM' de 24h, o mesmo formato que o banco já guarda em startTime/
 * endTime e que o <input type="time"> produzia — a troca não mexe em dado nenhum.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export const toHM = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

export function parseHM(s: string | null | undefined): { h: number; m: number } | null {
  const mt = s?.match(/^(\d{1,2}):(\d{2})$/);
  if (!mt) return null;
  const h = +mt[1], m = +mt[2];
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** Minutos desde 00:00 — a forma mais simples de comparar dois horários. */
export function minutesOf(hm: string | null | undefined): number | null {
  const p = parseHM(hm);
  return p ? p.h * 60 + p.m : null;
}

/**
 * Soma minutos dando a volta no dia: 23:50 + 20min = 00:10. Um turno noturno
 * atravessa a meia-noite, então estourar em 24:10 seria pior que dar a volta.
 */
export function addMinutes(hm: string, n: number): string {
  const p = parseHM(hm);
  if (!p) return hm;
  const total = (((p.h * 60 + p.m + n) % 1440) + 1440) % 1440;
  return toHM(Math.floor(total / 60), total % 60);
}

/** 00, 05, 10… conforme o passo. Passo inválido vira 1, para não gerar lista vazia. */
export function minuteOptions(step: number): number[] {
  const s = Number.isInteger(step) && step > 0 && step <= 60 ? step : 1;
  const out: number[] = [];
  for (let m = 0; m < 60; m += s) out.push(m);
  return out;
}

export const hourOptions = (): number[] => Array.from({ length: 24 }, (_, i) => i);

/**
 * Encaixa um horário no passo mais próximo para baixo, para o valor que veio do
 * banco (ex.: 09:07, salvo antes de existir passo) continuar aparecendo marcado
 * na coluna em vez de sumir.
 */
export function snapToStep(hm: string, step: number): string {
  const p = parseHM(hm);
  if (!p) return hm;
  const s = Number.isInteger(step) && step > 0 && step <= 60 ? step : 1;
  return toHM(p.h, Math.floor(p.m / s) * s);
}

/** true quando `hm` é anterior a `min` (ou posterior a `max`) — usado para desabilitar opção. */
export function outOfRange(hm: string, min?: string, max?: string): boolean {
  const v = minutesOf(hm);
  if (v == null) return false;
  const lo = minutesOf(min), hi = minutesOf(max);
  if (lo != null && v < lo) return true;
  if (hi != null && v > hi) return true;
  return false;
}

export function nowHM(now: Date = new Date(), step = 1): string {
  return snapToStep(toHM(now.getHours(), now.getMinutes()), step);
}
