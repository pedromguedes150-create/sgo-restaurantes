'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Encerramento de ocorrência (Supervisor/Admin): justificativa + ação corretiva + data de revisão. */
export function CloseForm({ occurrenceId }: { occurrenceId: string }) {
  const router = useRouter();
  const [justification, setJustification] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!justification.trim() || !correctiveAction.trim() || !reviewDate) {
      setError('Preencha justificativa, ação corretiva e data de revisão.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/occurrences/${occurrenceId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification, correctiveAction, reviewDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível encerrar');
        return;
      }
      router.refresh();
    } catch {
      setError('Falha de conexão');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="just">Justificativa</Label>
        <textarea
          id="just"
          rows={3}
          className="w-full rounded-lg border-2 border-input bg-background p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ca">Ação corretiva</Label>
        <textarea
          id="ca"
          rows={3}
          className="w-full rounded-lg border-2 border-input bg-background p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={correctiveAction}
          onChange={(e) => setCorrectiveAction(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rev">Data de revisão</Label>
        <Input id="rev" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
      </div>

      {error && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{error}</p>}

      <Button onClick={submit} disabled={loading} size="lg" className="w-full" variant="default">
        {loading ? 'Encerrando…' : (<><CheckCircle2 className="h-5 w-5" /> Encerrar ocorrência</>)}
      </Button>
    </div>
  );
}
