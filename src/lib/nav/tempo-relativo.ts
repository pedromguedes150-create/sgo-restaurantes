/**
 * "há 5 minutos", "há 2 dias" — sem date-fns (o kit usa `formatDistanceToNow`
 * com o locale ptBR; o Restaurante não carrega a biblioteca por uma função).
 * Puro: recebe o instante de referência para o teste não depender do relógio.
 */
export function tempoRelativo(iso: string | Date, agora: Date = new Date()): string {
  const t = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((agora.getTime() - t) / 1000));
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} minuto${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} hora${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} dia${d === 1 ? '' : 's'}`;
  const me = Math.round(d / 30);
  if (me < 12) return `há ${me} ${me === 1 ? 'mês' : 'meses'}`;
  const a = Math.round(me / 12);
  return `há ${a} ano${a === 1 ? '' : 's'}`;
}
