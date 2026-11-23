'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/ds/button';
import { StatusBadge } from '@/components/ui/ds/status-badge';

/**
 * Configurações → Utensílios: exigir ou não a auditoria da Supervisão
 * (v1.219.0). Desligada (o padrão), o envio já conclui o inventário.
 */
export function AuditoriaUtensiliosConfig({ exigir, podeEditar }: { exigir: boolean; podeEditar: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function mudar() {
    setOcupado(true); setErro(null);
    const r = await fetch('/api/utensilios/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'auditoria', exigir: !exigir }) });
    const b = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setErro(b.error ?? 'Falha ao gravar.'); return; }
    router.refresh();
  }
  return (
    <section className="sgo-panel sgo-panel--solid flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4" data-testid="auditoria-config">
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-semibold text-ink-900">Auditoria da Supervisão <StatusBadge tone={exigir ? 'success' : 'neutral'}>{exigir ? 'Exigida' : 'Não exigida'}</StatusBadge></p>
        <p className="text-xs text-ink-500">
          {exigir
            ? 'O inventário enviado fica pendente até a Supervisão ou a Coordenação aprovar ou devolver.'
            : 'O inventário é concluído no envio; a Supervisão só é avisada. O que já estava pendente continua pendente até ser aprovado à mão.'}
        </p>
        {erro && <p className="text-xs text-danger">{erro}</p>}
      </div>
      {podeEditar && <Button size="sm" variant="secondary" onClick={() => void mudar()} loading={ocupado}>{exigir ? 'Deixar de exigir' : 'Exigir auditoria'}</Button>}
    </section>
  );
}
