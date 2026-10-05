'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlayCircle } from 'lucide-react';

/**
 * Inicia (ou continua) a visita operacional: converte a visita planejada ou
 * cria uma para hoje, congela o resumo pré-visita e abre o roteiro (v1.155.0).
 */
export function IniciarVisita({ unitId, visitId, rotulo = 'Iniciar visita', primario = false }: { unitId?: string; visitId?: string; rotulo?: string; primario?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function iniciar() {
    setBusy(true); setErro(null);
    try {
      const r = await fetch('/api/supervision/operacional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'iniciar', unitId, visitId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error ?? 'Não foi possível iniciar.'); return; }
      router.push(`/modulos/supervisao/visita/${d.id}`);
    } finally { setBusy(false); }
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button type="button" className={`sgo-btn sgo-btn--sm ${primario ? 'sgo-btn--primary' : ''}`} disabled={busy} onClick={() => void iniciar()} data-testid="iniciar-visita">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} {rotulo}
      </button>
      {erro && <span className="text-xs text-danger" role="alert">{erro}</span>}
    </span>
  );
}
