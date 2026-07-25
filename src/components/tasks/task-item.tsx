'use client';

import Link from 'next/link';
import { Camera, Clock, AlertTriangle, ArrowRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

export interface TaskItemData {
  id: string;
  name: string;
  description: string | null;
  limitTime: string | null;
  requiresEvidence: boolean;
  status: 'PENDING' | 'DONE' | 'MISSED' | 'LATE';
  isOverdue: boolean;
  itemsCount?: number;
  /** Se a tarefa pertence a um módulo já implementado, "Realizar" abre o módulo. */
  moduleHref?: string | null;
}

export function TaskItem({ task }: { task: TaskItemData }) {
  const done = task.status === 'DONE' || task.status === 'LATE';
  const missed = task.status === 'MISSED';
  const execHref = `/tarefas/${task.id}`;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 shadow-sm transition-colors',
        done && 'border-success/40 bg-success/5',
        missed && 'border-critical/40 bg-critical/5',
        !done && !missed && task.isOverdue && 'border-critical',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('font-semibold', task.status === 'DONE' && 'text-success', missed && 'text-critical')}>{task.name}</p>
          {task.description && <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {task.limitTime ? `limite ${task.limitTime}` : 'sem horário'}</span>
            {task.itemsCount ? <span>{task.itemsCount} item(ns)</span> : null}
            {task.requiresEvidence && <span className="inline-flex items-center gap-1 text-gold-dark"><Camera className="h-3.5 w-3.5" /> exige foto</span>}
          </div>
        </div>
        {task.status === 'DONE' && <StatusBadge tone="success">Concluída</StatusBadge>}
        {task.status === 'LATE' && <StatusBadge tone="medium">Fora do prazo</StatusBadge>}
        {missed && <StatusBadge tone="critical">Não realizada</StatusBadge>}
        {!done && !missed && task.isOverdue && <StatusBadge tone="critical"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Atrasada</StatusBadge>}
      </div>

      {/* Ação: largura total no celular (alvo de toque), largura natural à direita no desktop */}
      <div className="mt-3 flex md:justify-end">
        {task.moduleHref && !done ? (
          <Link href={task.moduleHref} className="w-full md:w-auto"><Button className="w-full md:w-auto md:px-6">Realizar <ArrowRight className="h-5 w-5" /></Button></Link>
        ) : done ? (
          <Link href={execHref} className="w-full md:w-auto"><Button variant="outline" className="w-full md:w-auto md:px-6"><Eye className="h-4 w-4" /> Ver preenchimento</Button></Link>
        ) : (
          <Link href={execHref} className="w-full md:w-auto">
            <Button className="w-full md:w-auto md:px-6" variant={task.requiresEvidence ? 'gold' : 'default'}>
              {missed || task.isOverdue ? 'Realizar (atrasado)' : 'Realizar'} <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
