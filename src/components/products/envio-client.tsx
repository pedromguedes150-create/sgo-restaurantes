'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * A SAÍDA DA CARGA.
 *
 * Só aparece habilitado quando **todos os setores** terminaram. Enquanto falta
 * setor, a tela diz quantos itens faltam em vez de esconder o botão: o
 * separador que já acabou a parte dele precisa saber que está esperando outro
 * setor, e não que o sistema quebrou.
 */
export function EnvioClient({
  requestId,
  pronto,
  faltam,
}: {
  requestId: string;
  /** Todos os itens do pedido, de todos os setores, já foram tocados. */
  pronto: boolean;
  faltam: number;
}) {
  const router = useRouter();
  const [cdNote, setCdNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch('/api/products/envio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, cdNote }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error ?? 'Não foi possível confirmar o envio.');
        return;
      }
      router.refresh();
    } catch {
      setErro('Sem conexão. O envio NÃO foi confirmado.');
    } finally {
      setBusy(false);
    }
  }

  if (!pronto) {
    return (
      <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info">
        Ainda {faltam === 1 ? 'falta 1 item' : `faltam ${faltam} itens`} para separar neste pedido —
        de todos os setores somados. O envio libera quando a separação terminar.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <p className="text-sm font-medium text-ink-900">Separação concluída. Confirme quando a carga sair.</p>
      {erro && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{erro}</p>}
      <div>
        <Label htmlFor="cd-note">Observação do CD para a unidade (opcional)</Label>
        <textarea
          id="cd-note" rows={2} value={cdNote} onChange={(e) => setCdNote(e.target.value)}
          className="w-full rounded-lg border-2 border-line-strong bg-surface px-3 py-2 text-sm"
          placeholder="Ex.: dois fardos foram na doca 2; a muçarela vai no próximo carro."
        />
      </div>
      <Button className="w-full" onClick={enviar} disabled={busy}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Truck className="mr-1 h-4 w-4" />}
        Confirmar envio para a unidade
      </Button>
      <p className="sgo-type-11 text-ink-500">
        A unidade é avisada na hora e passa a poder conferir o recebimento. Depois disso a separação
        vira registro e não pode mais ser alterada.
      </p>
    </div>
  );
}
