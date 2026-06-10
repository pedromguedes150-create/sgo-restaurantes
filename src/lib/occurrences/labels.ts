import type { OccurrenceGravity, OccurrenceStatus } from '@prisma/client';
import type { StatusTone } from '@/components/ui/status-badge';

export const GRAVITY_META: Record<OccurrenceGravity, { label: string; emoji: string; tone: StatusTone }> = {
  LOW: { label: 'Baixa', emoji: '🟢', tone: 'success' },
  MEDIUM: { label: 'Média', emoji: '🟡', tone: 'medium' },
  HIGH: { label: 'Alta', emoji: '🔴', tone: 'critical' },
  CRITICAL: { label: 'Crítica', emoji: '⚫', tone: 'black' },
};

export const STATUS_META: Record<OccurrenceStatus, { label: string; tone: StatusTone }> = {
  OPEN: { label: 'Aberta', tone: 'critical' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'medium' },
  CLOSED: { label: 'Encerrada', tone: 'success' },
};

export const GRAVITY_ORDER: OccurrenceGravity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
