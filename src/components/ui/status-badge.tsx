import { cn } from '@/lib/utils';

/**
 * StatusBadge reutilizável — semáforo de gravidade/status (spec: componentes base).
 * Cores conforme regra nº 2 (crítico/médio/sucesso) + neutros.
 */
export type StatusTone = 'success' | 'medium' | 'critical' | 'black' | 'neutral';

/**
 * Fundo pelos tokens `-bg`, não por opacidade da própria cor: a tinta de 15%
 * deixava o par em 6,48-6,67:1, logo abaixo do AAA. Os `-bg` foram escolhidos
 * para este pareamento e dão 7,22+.
 */
const tones: Record<StatusTone, string> = {
  success: 'bg-sgo-success-bg text-sgo-success',
  medium: 'bg-warning-bg text-warning',
  critical: 'bg-danger-bg text-danger',
  black: 'bg-ink-900 text-sgo-surface',
  neutral: 'bg-sunken text-ink-500',
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
