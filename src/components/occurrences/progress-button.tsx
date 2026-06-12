'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Marca a ocorrência como "Em andamento" (Supervisor/Admin/CEO). */
export function ProgressButton({ occurrenceId }: { occurrenceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await fetch(`/api/occurrences/${occurrenceId}/progress`, { method: 'POST' });
          if (r.ok) router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Search className="h-4 w-4" /> Marcar em andamento
    </Button>
  );
}
