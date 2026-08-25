'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { formatBRL } from '@/lib/utils';
import { shortUnitName } from '@/lib/unit-name';

interface Reason { id: string; name: string }
interface Unit { id: string; name: string }
export interface ItemRow {
  id: string;
  unit: string;
  product: string;
  quantity: number;
  value: number;
  waiter: string | null;
  table: string | null;
  reason: string | null;
  delivered: boolean;
  photo: string | null;
  canceledAt: string;
  authorizedBy: string | null;
  note: string | null;
}

function agoraLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Cancelamento de item no pedido em aberto.
 *
 * A troca (Coca por Fanta) é feita no Teknisa e não passa por aqui — e é
 * justamente por ela existir que o cancelamento puro virou exceção a explicar.
 */
export function ItemCancellationsClient({
  units,
  reasons,
  rows,
}: {
  units: Unit[];
  reasons: Reason[];
  rows: ItemRow[];
}) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [value, setValue] = useState('');
  const [quando, setQuando] = useState(agoraLocal);
  const [table, setTable] = useState('');
  const [waiter, setWaiter] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const [delivered, setDelivered] = useState<'nao' | 'sim' | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function limpar() {
    setProduct(''); setQuantity('1'); setValue(''); setTable(''); setWaiter('');
    setReasonId(''); setNote(''); setDelivered(null); setPhoto(null); setQuando(agoraLocal());
    if (fileRef.current) fileRef.current.value = '';
  }

  async function enviar() {
    setMsg(null);
    if (!product.trim()) { setMsg({ t: 'err', m: 'Informe o produto.' }); return; }
    if (!value.trim()) { setMsg({ t: 'err', m: 'Informe o valor cancelado.' }); return; }
    if (delivered === null) { setMsg({ t: 'err', m: 'Diga se o produto já tinha saído da cozinha — é o que separa desistência de perda.' }); return; }
    if (delivered === 'sim' && !photo) { setMsg({ t: 'err', m: 'O produto saiu da cozinha: fotografe o que voltou.' }); return; }

    const fd = new FormData();
    fd.set('unitId', unitId);
    fd.set('productName', product);
    fd.set('quantity', quantity || '1');
    fd.set('value', value);
    fd.set('delivered', delivered === 'sim' ? 'true' : 'false');
    fd.set('canceledAt', new Date(quando).toISOString());
    if (table.trim()) fd.set('tableLabel', table);
    if (waiter.trim()) fd.set('waiterName', waiter);
    if (reasonId) fd.set('reasonId', reasonId);
    if (note.trim()) fd.set('note', note);
    if (photo) fd.set('photo', photo);

    setBusy(true);
    try {
      const res = await fetch('/api/cancellations/items', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ t: 'err', m: data.error ?? 'Falha ao registrar' }); return; }
      setMsg({ t: 'ok', m: `Cancelamento de ${product} registrado ✓` });
      limpar();
      router.refresh();
    } catch {
      setMsg({ t: 'err', m: 'Falha de conexão' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
        <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">Registrar cancelamento de item</h2>
        <p className="mb-2 text-xs text-ink-500">
          Se o cliente trocou de produto, faça a <b>troca</b> no Teknisa — a venda continua e não é caso para esta tela.
          Aqui entra o item que saiu do pedido e <b>nada entrou no lugar</b>.
        </p>

        <div className="space-y-2">
          {units.length > 1 && (
            <Select label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Produto <span className="text-danger">*</span></Label>
              <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="ex.: Coca-Cola lata" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Quantidade</Label>
              <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Valor total (R$) <span className="text-danger">*</span></Label>
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Mesa / comanda</Label>
              <Input value={table} onChange={(e) => setTable(e.target.value)} placeholder="opcional" className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Hora</Label>
              <Input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Garçom que lançou</Label>
              <Input value={waiter} onChange={(e) => setWaiter(e.target.value)} placeholder="nome" className="h-9 text-sm" />
            </div>
          </div>

          <Select label="Motivo" placeholder="Selecione…" value={reasonId} onValueChange={setReasonId} options={reasons.map((r) => ({ value: r.id, label: r.name }))} />

          {/* A PERGUNTA QUE DECIDE TUDO. Cancelar antes de o produto sair custa
              zero; depois que saiu, ou virou perda ou alguém consumiu de graça. */}
          <div className="rounded-md border border-line-strong bg-surface p-2">
            <p className="mb-1 text-sm font-semibold text-ink-900">O produto já tinha saído da cozinha/bar?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDelivered('nao')}
                aria-pressed={delivered === 'nao'}
                className={`flex-1 rounded-control px-3 py-2 text-sm font-semibold ${delivered === 'nao' ? 'bg-success text-on-brand' : 'border text-ink-700'}`}
              >
                Não saiu
              </button>
              <button
                type="button"
                onClick={() => setDelivered('sim')}
                aria-pressed={delivered === 'sim'}
                className={`flex-1 rounded-control px-3 py-2 text-sm font-semibold ${delivered === 'sim' ? 'bg-danger text-on-brand' : 'border text-ink-700'}`}
              >
                Já tinha saído
              </button>
            </div>
            {delivered === 'sim' && (
              <div className="mt-2">
                <Label className="text-xs">Foto do produto que voltou <span className="text-danger">*</span></Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                  aria-label="Foto do produto que voltou"
                />
                <p className="text-[11px] text-ink-500">
                  {photo ? `Foto escolhida: ${photo.name}` : 'O produto saiu e voltou — a foto é a prova de que voltou.'}
                </p>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Observação</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="o que houve" className="h-9 text-sm" />
          </div>

          {msg && <p className={msg.t === 'ok' ? 'text-sm font-medium text-success' : 'text-sm font-medium text-danger'}>{msg.m}</p>}

          <Button onClick={enviar} disabled={busy} className="w-full">
            <Check className="h-4 w-4" /> {busy ? 'Registrando…' : 'Registrar cancelamento'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="sgo-type-11 font-semibold text-ink-900">Cancelamentos do mês ({rows.length})</h2>
        {rows.length === 0 && <p className="text-sm text-ink-500">Nenhum cancelamento de item registrado neste mês.</p>}

        {rows.map((r) => (
          <div key={r.id} className={`rounded-lg border bg-surface p-3 ${r.delivered ? 'border-danger/40' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-ink-900">
                {r.quantity > 1 ? `${r.quantity}× ` : ''}{r.product}
              </p>
              <span className="shrink-0 font-bold text-danger">{formatBRL(r.value)}</span>
            </div>
            <p className="text-xs text-ink-500">
              {r.unit} · {hora(r.canceledAt)}
              {r.table && ` · mesa ${r.table}`}
              {r.waiter && ` · garçom ${r.waiter}`}
            </p>
            <p className="text-xs text-ink-500">
              {r.reason ?? 'sem motivo'}
              {r.authorizedBy && ` · autorizado por ${r.authorizedBy}`}
            </p>
            {r.note && <p className="mt-1 text-xs text-ink-700">{r.note}</p>}
            {r.delivered ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-danger">
                <AlertTriangle className="h-3.5 w-3.5" /> Produto já tinha saído da cozinha
              </p>
            ) : (
              <p className="mt-1 text-xs text-success">Cancelado antes de sair da cozinha</p>
            )}
            {r.photo && (
              <a href={`/${r.photo}`} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <Camera className="h-3.5 w-3.5" /> Ver foto
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
