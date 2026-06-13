'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function AcceptTerms() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await fetch('/api/terms/accept', { method: 'POST' });
          if (r.ok) { window.location.assign('/dashboard'); return; }
        } finally { setBusy(false); }
      }}
    >
      {busy ? 'Registrando…' : 'Li e aceito'}
    </Button>
  );
}
