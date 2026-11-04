'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** "Copiar texto" (v1.185.0): o pedido inteiro como texto, para colar no WhatsApp. */
export function CopiarTexto({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* sem clipboard: nada a fazer */ }
  }
  return <Button size="sm" variant="outline" onClick={copiar} className="print:hidden"><Copy className="h-4 w-4" /> {ok ? 'Copiado!' : 'Copiar texto'}</Button>;
}
