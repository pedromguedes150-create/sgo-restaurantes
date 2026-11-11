'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Reposições aguardando RECEBIMENTO FÍSICO (v1.202.0). A comanda nova só entra
 * na conferência depois que alguém da unidade confirma que ela chegou — assim
 * uma comanda que ainda está no caminho nunca vira "faltante".
 */
export function ReposicoesPendentes({ unitId, numeros }: { unitId: string; numeros: number[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (numeros.length === 0) return null;

  async function confirmar(n: number) {
    setBusy(n); setErro(null);
    try {
      const res = await fetch('/api/commands/replacements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirmar', unitId, number: n }),
      });
      if (res.ok) { router.refresh(); return; }
      const d = await res.json().catch(() => ({}));
      setErro(String(d.error ?? 'Não foi possível confirmar.'));
    } catch { setErro('Falha de conexão. Tente de novo.'); } finally { setBusy(null); }
  }

  return (
    <div className="rounded-lg border-2 border-info bg-surface p-3" data-testid="reposicoes-pendentes">
      <p className="text-sm font-semibold text-ink-900">
        <PackageCheck className="mr-1 inline h-4 w-4 text-info" />
        Comandas de reposição aguardando recebimento ({numeros.length})
      </p>
      <p className="text-xs text-ink-700">Confirme quando a comanda física chegar na unidade. Até lá ela não entra na conferência nem vira faltante.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {numeros.map((n) => (
          <Button key={n} size="sm" variant="outline" disabled={busy !== null} onClick={() => void confirmar(n)} data-testid={`confirmar-recebimento-${n}`}>
            {busy === n ? 'Confirmando…' : `Recebi a nº ${n}`}
          </Button>
        ))}
      </div>
      {erro && <p className="mt-1 text-sm font-medium text-danger" role="alert">{erro}</p>}
    </div>
  );
}
