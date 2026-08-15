'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConfirmRead({ popId, confirmed, trainingRecordId = null }: { popId: string; confirmed: boolean; trainingRecordId?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (confirmed && !trainingRecordId) return <p className="rounded-lg bg-sgo-success/10 px-3 py-2 text-sm font-semibold text-sgo-success">✓ Leitura confirmada</p>;
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await fetch(`/api/pops/${popId}/read`, { method: 'POST' });
          // Veio de Treinamentos: confirmar a leitura também marca o treinamento como feito
          if (r.ok && trainingRecordId) {
            await fetch('/api/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', recordId: trainingRecordId }) }).catch(() => {});
            router.push('/modulos/treinamentos');
            router.refresh();
            return;
          }
          if (r.ok) router.refresh();
        } finally { setBusy(false); }
      }}
    >
      <CheckCircle2 className="h-5 w-5" /> {trainingRecordId ? 'Confirmar leitura e marcar treinado' : 'Confirmar leitura'}
    </Button>
  );
}
