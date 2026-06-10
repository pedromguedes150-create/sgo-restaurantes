import { cn } from '@/lib/utils';

/**
 * StatusBadge reutilizável — semáforo de gravidade/status (spec: componentes base).
 * Cores conforme regra nº 2 (crítico/médio/sucesso) + neutros.
 */
export type StatusTone = 'success' | 'medium' | 'critical' | 'black' | 'neutral';

const tones: Record<StatusTone, string> = {
  success: 'bg-success/15 text-success',
  medium: 'bg-medium/15 text-[#92600A]',
  critical: 'bg-critical/15 text-critical',
  black: 'bg-zinc-800 text-white',
  neutral: 'bg-secondary text-muted-foreground',
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
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
