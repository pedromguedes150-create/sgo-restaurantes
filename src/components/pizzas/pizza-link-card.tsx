'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';

/**
 * O link interno de preenchimento, pronto para copiar.
 *
 * A origem sai de `window.location.origin` (mesmo padrão das fichas por link):
 * o SGO responde por endereços diferentes em desenvolvimento e em produção, e
 * fixar um deles entregaria um link quebrado na outra ponta.
 *
 * A origem só entra DEPOIS de montar, e não durante o render: lê-la no corpo do
 * componente faz o servidor desenhar o caminho relativo e o cliente o absoluto,
 * e o React derruba a hidratação da página inteira por causa dessa diferença.
 */
export function PizzaLinkCard({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false);
  const [url, setUrl] = useState(`/pizzas/${token}`);

  useEffect(() => {
    setUrl(`${window.location.origin}/pizzas/${token}`);
  }, [token]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <p className="sgo-type-11 font-semibold text-ink-900">Link de preenchimento</p>
      <p className="mt-0.5 text-xs text-ink-500">
        Uso interno da operação. Abre sem login e já vem amarrado a esta unidade — quem preenche não escolhe unidade.
      </p>
      <p className="mt-2 break-all rounded-control bg-sunken px-2 py-1.5 text-xs text-ink-700">{url}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" onClick={copiar}>
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiado ? 'Copiado' : 'Copiar link'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.open(url, '_blank', 'noopener')}>
          <ExternalLink className="h-4 w-4" /> Abrir
        </Button>
      </div>
    </div>
  );
}
