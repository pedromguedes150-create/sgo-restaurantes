'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Loader2, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * A SAÍDA DA CARGA — em dois passos, o primeiro opcional.
 *
 * 1. "Carga conferida" (v1.116.0): alguém conferiu a carga reunida na doca
 *    contra o romaneio. Depois disso a separação trava.
 * 2. "Confirmar envio": a carga saiu. Liberado tanto de Separado quanto de
 *    Conferido — obrigar a conferência travaria quem já opera sem ela.
 *
 * Enquanto falta setor, a tela diz quantos itens faltam em vez de esconder o
 * botão: o separador que já acabou a parte dele precisa saber que está
 * esperando outro setor, e não que o sistema quebrou.
 */
export function EnvioClient({
  requestId,
  pronto,
  faltam,
  status = 'PRONTO_ENVIO',
  conferidoPor,
}: {
  requestId: string;
  /** Todos os itens do pedido, de todos os setores, já foram tocados. */
  pronto: boolean;
  faltam: number;
  /** 'PRONTO_ENVIO' | 'CONFERIDO' | outro. */
  status?: string;
  conferidoPor?: string | null;
}) {
  const router = useRouter();
  const [cdNote, setCdNote] = useState('');
  const [busy, setBusy] = useState<'conferir' | 'enviar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function chamar(body: Record<string, unknown>, qual: 'conferir' | 'enviar') {
    setBusy(qual);
    setErro(null);
    try {
      const res = await fetch('/api/products/envio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, ...body }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error ?? (qual === 'enviar' ? 'Não foi possível confirmar o envio.' : 'Não foi possível marcar a conferência.'));
        return;
      }
      router.refresh();
    } catch {
      setErro(qual === 'enviar' ? 'Sem conexão. O envio NÃO foi confirmado.' : 'Sem conexão. A conferência NÃO foi gravada.');
    } finally {
      setBusy(null);
    }
  }

  if (!pronto) {
    return (
      <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info">
        Ainda {faltam === 1 ? 'falta 1 item' : `faltam ${faltam} itens`} para separar neste pedido —
        de todos os setores somados. A conferência e o envio liberam quando a separação terminar.
      </p>
    );
  }

  const conferido = status === 'CONFERIDO';

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <p className="text-sm font-medium text-ink-900">
        {conferido ? `Carga conferida${conferidoPor ? ` por ${conferidoPor}` : ''}. Confirme quando ela sair.` : 'Separação concluída. Confira a carga na doca e confirme quando ela sair.'}
      </p>
      {erro && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{erro}</p>}

      {!conferido && (
        <Button variant="outline" className="w-full" onClick={() => void chamar({ acao: 'conferir' }, 'conferir')} disabled={busy !== null}>
          {busy === 'conferir' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-1 h-4 w-4" />}
          Marcar carga conferida
        </Button>
      )}

      <div>
        <Label htmlFor="cd-note">Observação do CD para a unidade (opcional)</Label>
        <textarea
          id="cd-note" rows={2} value={cdNote} onChange={(e) => setCdNote(e.target.value)}
          className="w-full rounded-lg border-2 border-line-strong bg-surface px-3 py-2 text-sm"
          placeholder="Ex.: dois fardos foram na doca 2; a muçarela vai no próximo carro."
        />
      </div>
      <Button className="w-full" onClick={() => void chamar({ cdNote }, 'enviar')} disabled={busy !== null}>
        {busy === 'enviar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Truck className="mr-1 h-4 w-4" />}
        Confirmar envio para a unidade
      </Button>
      <p className="sgo-type-11 text-ink-500">
        {conferido
          ? 'A separação já está travada pela conferência. A unidade é avisada na hora e passa a poder conferir o recebimento.'
          : 'Marcar a conferência trava a separação (nada muda depois de conferido). O envio pode ser confirmado com ou sem conferência; a unidade é avisada na hora e, depois disso, a separação vira registro e não pode mais ser alterada.'}
      </p>
    </div>
  );
}
