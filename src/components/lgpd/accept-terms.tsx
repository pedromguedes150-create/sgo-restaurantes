'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function AcceptTerms() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await fetch('/api/terms/accept', { method: 'POST' });
          if (r.ok) { router.replace('/dashboard'); router.refresh(); }
        } finally { setBusy(false); }
      }}
    >
      {busy ? 'Registrando…' : 'Li e aceito'}
    </Button>
  );
}
