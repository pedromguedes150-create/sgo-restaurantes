'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, TriangleAlert, Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DIVERGENCIAS, AVALIACOES } from '@/lib/products/entrega-tela';

export interface ItemParaConferir {
  id: string;
  name: string;
  measure: string;
  qtyRequested: number;
  qtySeparated: number | null;
  missingLabel: string | null;
}

interface Apontamento {
  issue: string;
  note: string;
  foto: File | null;
}

/**
 * A CONFERÊNCIA DO RECEBIMENTO.
 *
 * A tela começa com **tudo certo** e o gerente aponta só a exceção. O caminho
 * inverso — marcar item por item o que chegou bem — transformaria um pedido de
 * trinta linhas em trinta toques para dizer "nada aconteceu", e a conferência
 * simplesmente deixaria de ser feita.
 *
 * O que o CD separou aparece ao lado de cada item, porque é contra esse número
 * que se confere — não contra o que foi pedido. Item que o CD já marcou como
 * falta não é surpresa na doca.
 */
export function RecebimentoClient({
  requestId,
  itens,
}: {
  requestId: string;
  itens: ItemParaConferir[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [apontados, setApontados] = useState<Record<string, Apontamento>>({});
  const [quality, setQuality] = useState('');
  const [packaging, setPackaging] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const total = Object.values(apontados).filter((a) => a.issue).length;

  function apontar(id: string) {
    setApontados((a) => ({ ...a, [id]: a[id] ?? { issue: '', note: '', foto: null } }));
  }
  function retirar(id: string) {
    setApontados((a) => { const n = { ...a }; delete n[id]; return n; });
  }
  function mudar(id: string, campo: keyof Apontamento, valor: string | File | null) {
    setApontados((a) => ({ ...a, [id]: { ...a[id], [campo]: valor } as Apontamento }));
  }

  async function confirmar() {
    const semMotivo = Object.entries(apontados).filter(([, a]) => !a.issue);
    if (semMotivo.length > 0) { setErro('Todo item apontado precisa de um motivo.'); return; }

    setBusy(true);
    setErro(null);
    try {
      const form = new FormData();
      form.set('requestId', requestId);
      form.set('quality', quality);
      form.set('packaging', packaging);
      form.set('note', note);
      form.set('itens', JSON.stringify(
        Object.entries(apontados).map(([itemId, a]) => ({ itemId, issue: a.issue, note: a.note })),
      ));
      for (const [itemId, a] of Object.entries(apontados)) {
        if (a.foto) form.set(`foto-${itemId}`, a.foto);
      }

      const res = await fetch('/api/products/recebimento', { method: 'POST', body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error ?? 'Não foi possível registrar a conferência.');
        return;
      }
      setAberto(false);
      router.refresh();
    } catch {
      setErro('Sem conexão. A conferência NÃO foi registrada.');
    } finally {
      setBusy(false);
    }
  }

  if (!aberto) {
    return (
      <Button className="w-full" onClick={() => setAberto(true)}>
        <Check className="mr-1 h-4 w-4" />Conferir recebimento
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface p-3">
      <div>
        <p className="font-medium text-ink-900">Conferência do recebimento</p>
        <p className="text-sm text-ink-500">
          Aponte só o que veio errado. O que você não marcar é registrado como recebido conforme o CD separou.
        </p>
      </div>

      {erro && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{erro}</p>}

      <div className="space-y-2">
        {itens.map((i) => {
          const a = apontados[i.id];
          return (
            <div key={i.id} className={`rounded-lg border p-2 ${a ? 'border-warning bg-warning-bg' : 'border-line'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{i.name}</p>
                  <p className="sgo-type-11 text-ink-500">
                    {i.qtySeparated === null
                      ? `Pedido: ${i.qtyRequested} ${i.measure} · o CD não separou`
                      : `O CD separou ${i.qtySeparated} de ${i.qtyRequested} ${i.measure}`}
                    {i.missingLabel ? ` · ${i.missingLabel}` : ''}
                  </p>
                </div>
                {a ? (
                  <Button variant="outline" size="sm" onClick={() => retirar(i.id)}>
                    <X className="h-4 w-4" /><span className="ml-1">Está certo</span>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => apontar(i.id)}>
                    <TriangleAlert className="h-4 w-4" /><span className="ml-1">Apontar</span>
                  </Button>
                )}
              </div>

              {a && (
                <div className="mt-2 space-y-2">
                  <select
                    className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-900"
                    value={a.issue} onChange={(e) => mudar(i.id, 'issue', e.target.value)}
                    aria-label={`Motivo para ${i.name}`}
                  >
                    <option value="">O que houve?</option>
                    {DIVERGENCIAS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <input
                    className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-900"
                    placeholder="Detalhe (opcional)"
                    value={a.note} onChange={(e) => mudar(i.id, 'note', e.target.value)}
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-brand">
                    <Camera className="h-4 w-4" />
                    {a.foto ? a.foto.name : 'Anexar foto (opcional)'}
                    <input
                      type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => mudar(i.id, 'foto', e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="qualidade">Qualidade dos produtos</Label>
          <select
            id="qualidade" className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-900"
            value={quality} onChange={(e) => setQuality(e.target.value)}
          >
            <option value="">Não avaliar</option>
            {AVALIACOES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="embalagem">Embalagem / transporte</Label>
          <select
            id="embalagem" className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-900"
            value={packaging} onChange={(e) => setPackaging(e.target.value)}
          >
            <option value="">Não avaliar</option>
            {AVALIACOES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="obs-receb">Observação da conferência (opcional)</Label>
        <textarea
          id="obs-receb" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border-2 border-line-strong bg-surface px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="flex-1" onClick={confirmar} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
          {total === 0
            ? 'Confirmar recebimento'
            : `Confirmar com ${total} ${total === 1 ? 'divergência' : 'divergências'}`}
        </Button>
        <Button variant="outline" onClick={() => setAberto(false)} disabled={busy}>Cancelar</Button>
      </div>
      {total > 0 && (
        <p className="sgo-type-11 text-ink-500">
          A divergência não impede fechar o pedido — ela é registrada e o CD é avisado.
        </p>
      )}
    </div>
  );
}
