'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';

/**
 * Chave "Exigir foto no desperdício do Restaurante" (Admin, v1.152.0).
 * Desligada (padrão): a foto de cada procedimento é OPCIONAL. Ligada: cada
 * procedimento com peso precisa da sua foto — na tela e no servidor.
 * A frente Salgados não depende disto: lá a foto do recipiente já é obrigatória.
 */
export function WastePhotoConfig({ required }: { required: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(required);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function alternar() {
    const novo = !on;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'wastePhoto', action: 'setRequired', required: novo }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha ao salvar'); return; }
      setOn(novo); setMsg('Salvo!'); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-xl">
        <p className="flex items-center gap-1.5 sgo-type-15 font-semibold text-ink-900"><Camera className="h-4 w-4 text-brand" /> Exigir foto no desperdício do Restaurante</p>
        <p className="mt-0.5 text-xs text-ink-500">
          {on
            ? 'Ligado: cada procedimento com peso (Sobra Limpa e Sobra de Produção, almoço e jantar) só salva com a sua foto.'
            : 'Desligado: a foto é opcional. Se o gerente tirar, ela aparece na Conferência do painel. Ligue quando a rede for passar a cobrar.'}
          {' '}Salgados já exige a foto do recipiente, independente desta chave.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {msg && <span className={`text-xs ${msg === 'Salvo!' ? 'text-success' : 'text-danger'}`}>{msg}</span>}
        <button type="button" role="switch" aria-checked={on} aria-label="Exigir foto no desperdício do Restaurante" disabled={busy} onClick={() => void alternar()}
          data-testid="chave-foto-restaurante"
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition ${on ? 'bg-brand' : 'bg-ink-400'} disabled:opacity-60`}>
          <span className={`inline-block h-5 w-5 rounded-pill bg-surface shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
    </div>
  );
}
