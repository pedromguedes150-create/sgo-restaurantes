'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConfirmRead({ popId, confirmed }: { popId: string; confirmed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (confirmed) return <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">✓ Leitura confirmada</p>;
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { const r = await fetch(`/api/pops/${popId}/read`, { method: 'POST' }); if (r.ok) router.refresh(); } finally { setBusy(false); }
      }}
    >
      <CheckCircle2 className="h-5 w-5" /> Confirmar leitura
    </Button>
  );
}
