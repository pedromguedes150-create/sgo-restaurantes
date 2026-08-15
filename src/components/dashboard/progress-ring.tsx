import { cn } from '@/lib/utils';

/** Anel de progresso (SVG) — progresso de tarefas do dia operacional. */
export function ProgressRing({
  value,
  size = 120,
  stroke = 12,
  label,
  sublabel,
}: {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const tone = pct >= 100 ? 'text-success' : pct >= 60 ? 'text-warning' : 'text-danger';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-secondary" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={cn('transition-all', tone)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-brand">{label ?? `${pct}%`}</span>
        {sublabel && <span className="text-xs text-ink-500">{sublabel}</span>}
      </div>
    </div>
  );
}
