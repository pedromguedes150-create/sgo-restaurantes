import { cn } from '@/lib/utils';

/**
 * StatusBadge reutilizável — semáforo de gravidade/status (spec: componentes base).
 * Desde a Fase 4 do kit (v1.145.0) é o SELO do kit (`.sgo-tag`), o mesmo do
 * `ds/status-badge`: sucesso/médio/crítico → verde/âmbar/vermelho do kit;
 * `black` (gravíssima) continua tinta escura cheia, que o kit não tem.
 */
export type StatusTone = 'success' | 'medium' | 'critical' | 'black' | 'neutral';

const tones: Record<StatusTone, string> = {
  success: 'sgo-tag--green',
  medium: 'sgo-tag--amber',
  critical: 'sgo-tag--red',
  black: 'bg-ink-900 text-surface',
  neutral: 'sgo-tag--gray',
};

export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('sgo-tag', tones[tone], className)}>
      {children}
    </span>
  );
}
