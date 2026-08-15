'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Reenvia a cobrança de confirmação para os destinatários pendentes. */
export function RemindButton({ id, pending }: { id: string; pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function remind() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/communications/${id}/remind`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      setMsg(`Cobrança enviada a ${data.reminded} pendente(s).`);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy || pending === 0} onClick={remind}><BellRing className="h-4 w-4" /> Cobrar pendentes ({pending})</Button>
      {msg && <span className="text-xs font-medium text-success">{msg}</span>}
    </div>
  );
}
