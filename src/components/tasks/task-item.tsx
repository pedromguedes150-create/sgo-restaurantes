'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Check, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

export interface TaskItemData {
  id: string;
  name: string;
  description: string | null;
  limitTime: string;
  requiresEvidence: boolean;
  status: 'PENDING' | 'DONE' | 'MISSED';
  isOverdue: boolean;
  /** Se a tarefa pertence a um módulo já implementado, "Realizar" abre o módulo. */
  moduleHref?: string | null;
}

export function TaskItem({ task }: { task: TaskItemData }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete(evidence?: File) {
    setError(null);
    setLoading(true);
    try {
      let res: Response;
      if (evidence) {
        const fd = new FormData();
        fd.append('evidence', evidence);
        res = await fetch(`/api/tasks/${task.id}/complete`, { method: 'POST', body: fd });
      } else {
        res = await fetch(`/api/tasks/${task.id}/complete`, { method: 'POST' });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Não foi possível concluir');
        return;
      }
      router.refresh();
    } catch {
      setError('Falha de conexão');
    } finally {
      setLoading(false);
    }
  }

  function onRealizar() {
    if (task.requiresEvidence) {
      fileRef.current?.click(); // abre a câmera (capture)
    } else {
      complete();
    }
  }

  const done = task.status === 'DONE';
  const missed = task.status === 'MISSED';

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
          <p className={cn('font-semibold', done && 'text-success', missed && 'text-critical')}>
            {task.name}
          </p>
          {task.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> limite {task.limitTime}
            </span>
            {task.requiresEvidence && (
              <span className="inline-flex items-center gap-1 text-gold-dark">
                <Camera className="h-3.5 w-3.5" /> exige foto
              </span>
            )}
          </div>
        </div>

        {done && <StatusBadge tone="success">Concluída</StatusBadge>}
        {missed && <StatusBadge tone="critical">Não realizada</StatusBadge>}
        {!done && !missed && task.isOverdue && (
          <StatusBadge tone="critical">
            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Atrasada
          </StatusBadge>
        )}
      </div>

      {error && <p className="mt-2 text-sm font-medium text-critical">{error}</p>}

      {!done && !missed && task.moduleHref && (
        <div className="mt-3">
          <Link href={task.moduleHref}>
            <Button className="w-full" variant="default">
              Realizar <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      )}

      {!done && !missed && !task.moduleHref && (
        <div className="mt-3">
          <Button onClick={onRealizar} disabled={loading} className="w-full" variant={task.requiresEvidence ? 'gold' : 'default'}>
            {loading ? (
              'Salvando…'
            ) : task.requiresEvidence ? (
              <>
                <Camera className="h-5 w-5" /> Tirar foto e concluir
              </>
            ) : (
              <>
                <Check className="h-5 w-5" /> Realizar
              </>
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) complete(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
