'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';

/** Botão que abre (ou retoma) a contagem de uma unidade e leva para a folha. */
export function AbrirContagem({ unitId, rotulo }: { unitId: string; rotulo: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function abrir() {
    setOcupado(true); setErro(null);
    const r = await fetch('/api/utensilios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'abrir', unitId }) });
    const b = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setErro(b.error ?? 'Não foi possível abrir a contagem.'); return; }
    router.push(`/modulos/inventario-utensilios/${b.id}`);
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={() => void abrir()} loading={ocupado}><ClipboardList className="h-4 w-4" /> {rotulo}</Button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </div>
  );
}
