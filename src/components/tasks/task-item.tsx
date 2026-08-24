'use client';

import { Camera } from 'lucide-react';
import { ListRow } from '@/components/ui/ds/list-row';
import { StatusBadge, type Tone } from '@/components/ui/ds/status-badge';
import { hrefDetalheTarefa } from '@/lib/tasks/links';

export interface TaskItemData {
  id: string;
  name: string;
  description: string | null;
  limitTime: string | null;
  requiresEvidence: boolean;
  status: 'PENDING' | 'DONE' | 'MISSED' | 'LATE';
  isOverdue: boolean;
  itemsCount?: number;
  /** Se a tarefa pertence a um módulo já implementado, a linha abre o módulo. */
  moduleHref?: string | null;
}

/**
 * Uma tarefa = uma LINHA (Onda 3). Antes era um cartão com um botão primário
 * cheio em cada registro — numa unidade com 29 tarefas, 29 botões bordô
 * competindo entre si (viola "um primário por tela"). Agora a linha inteira é
 * a ação: toca e vai executar. O chevron do ListRow indica a navegação.
 */
export function TaskItem({ task, unitParam }: { task: TaskItemData; unitParam?: string }) {
  const done = task.status === 'DONE' || task.status === 'LATE';
  const missed = task.status === 'MISSED';
  /* O filtro de unidade viaja com o link. Sem isso, a volta do detalhe caía na
     lista de TODAS as unidades: quem estava vendo Moreira perdia o lugar e
     tinha de filtrar de novo a cada tarefa aberta. Só no link do detalhe — os
     módulos têm o seletor global de unidade e não leem este parâmetro. */
  const href = !done && task.moduleHref ? task.moduleHref : hrefDetalheTarefa(task.id, unitParam);

  const badge: { tone: Tone; label: string } =
    task.status === 'DONE' ? { tone: 'success', label: 'Concluída' }
    : task.status === 'LATE' ? { tone: 'warning', label: 'Fora do prazo' }
    : missed ? { tone: 'danger', label: 'Não realizada' }
    : task.isOverdue ? { tone: 'danger', label: 'Atrasada' }
    : { tone: 'neutral', label: 'A fazer' };

  const subtitle = [
    task.description,
    task.limitTime ? `limite ${task.limitTime}` : null,
    task.itemsCount ? `${task.itemsCount} item(ns)` : null,
  ].filter(Boolean).join(' · ');

  return (
    <ListRow
      href={href}
      title={task.name}
      subtitle={subtitle || undefined}
      trailing={
        <>
          {task.requiresEvidence && !done && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-500" title="Exige foto">
              <Camera className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Exige foto</span>
            </span>
          )}
          <StatusBadge tone={badge.tone} dot>{badge.label}</StatusBadge>
        </>
      }
    />
  );
}
