'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Minus, Send, Printer, Factory, Warehouse, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';

interface Prod { id: string; name: string; origin: string; category: string; measure: string }
interface ReqItem { name: string; category: string; measure: string; qty: number }
interface Req { id: string; origin: string; number: number; status: string; createdByName: string; note: string | null; createdAt: string; items: ReqItem[]; unitName?: string }

const ORIGIN = { FABRICA: { label: 'Fábrica', icon: Factory }, CD: { label: 'CD', icon: Warehouse } } as const;
const STATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'Novo', cls: 'bg-danger/15 text-danger' },
  SEPARATING: { label: 'Em separação', cls: 'bg-warning/30 text-warning' },
  SENT: { label: 'Enviado', cls: 'bg-brand/15 text-brand' },
  RECEIVED: { label: 'Recebido', cls: 'bg-success/15 text-success' },
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ProductsClient({ units, selUnitId, isOps, products, myRequests, incoming }: {
  units: { id: string; name: string }[]; selUnitId: string; isOps: boolean; products: Prod[]; myRequests: Req[]; incoming: Req[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'novo' | 'meus' | 'ops'>('novo');
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { router.refresh(); return true; }
      const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); return false;
    } finally { setBusy(false); }
  }

  const tabs = [{ k: 'novo', l: 'Novo pedido' }, { k: 'meus', l: `Meus pedidos (${myRequests.length})` }, ...(isOps ? [{ k: 'ops', l: `Fábrica/CD (${incoming.length})` }] : [])] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as typeof tab)} className={tab === t.k ? 'rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>{t.l}</button>
        ))}
      </div>

      {tab === 'novo' && <NewOrder units={units} selUnitId={selUnitId} products={products} post={post} busy={busy} />}
      {tab === 'meus' && <RequestList requests={myRequests} onReceive={(id) => post({ action: 'status', id, status: 'RECEIVED' })} busy={busy} showUnit={false} />}
      {tab === 'ops' && <OpsView requests={incoming} post={post} busy={busy} />}
    </div>
  );
}

function NewOrder({ units, selUnitId, products, post, busy }: { units: { id: string; name: string }[]; selUnitId: string; products: Prod[]; post: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const [unitId, setUnitId] = useState(selUnitId);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');

  const filtered = useMemo(() => { const t = norm(q.trim()); return products.filter((p) => !t || norm(p.name).includes(t) || norm(p.category).includes(t)); }, [products, q]);
  const byCat = useMemo(() => { const m = new Map<string, Prod[]>(); for (const p of filtered) { const a = m.get(p.category) ?? []; a.push(p); m.set(p.category, a); } return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')); }, [filtered]);
  const setQty = (id: string, qty: number) => setCart((c) => { const n = { ...c }; if (qty <= 0) delete n[id]; else n[id] = qty; return n; });

  const cartByOrigin = useMemo(() => {
    const out: Record<string, { p: Prod; qty: number }[]> = { FABRICA: [], CD: [] };
    for (const [id, qty] of Object.entries(cart)) { const p = products.find((x) => x.id === id); if (p) out[p.origin].push({ p, qty }); }
    return out;
  }, [cart, products]);
  const totalItems = Object.keys(cart).length;

  async function submit() {
    const items = Object.entries(cart).map(([productId, qty]) => ({ productId, qty }));
    if (items.length === 0) return;
    if (await post({ action: 'order', unitId, items, note })) { setCart({}); setNote(''); }
  }

  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <Select aria-label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto (ignora acento)…" className="h-11 w-full rounded-lg border-2 border-line-strong bg-surface pl-9 pr-3 text-sm" />
      </div>

      {products.length === 0 && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Catálogo vazio. Peça ao Admin para cadastrar/importar produtos em Configurações → Produtos.</p>}

      <div className="space-y-3">
        {byCat.map(([cat, list]) => (
          <div key={cat}>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">{cat}</p>
            <div className="space-y-1.5">
              {list.map((p) => {
                const O = ORIGIN[p.origin as keyof typeof ORIGIN];
                const qty = cart[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border bg-surface p-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-brand">{p.name}</p>
                      <p className="text-[11px] text-ink-500"><O.icon className="mr-0.5 inline h-3 w-3" />{O.label} · {p.measure}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setQty(p.id, Math.max(0, Math.round((qty - 1) * 100) / 100))} className="rounded-md border p-1.5"><Minus className="h-3.5 w-3.5" /></button>
                      <input inputMode="decimal" value={qty || ''} onChange={(e) => setQty(p.id, parseFloat(e.target.value.replace(',', '.')) || 0)} placeholder="0" className="h-8 w-14 rounded-md border-2 border-line-strong bg-surface text-center text-sm" />
                      <button onClick={() => setQty(p.id, Math.round((qty + 1) * 100) / 100)} className="rounded-md border p-1.5"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Carrinho */}
      {totalItems > 0 && (
        <div className="sticky bottom-20 z-20 rounded-xl border-2 border-brand/40 bg-surface/95 p-3 shadow-lg backdrop-blur md:bottom-2">
          <p className="mb-1 text-sm font-bold text-brand">Resumo do pedido ({totalItems} itens)</p>
          {(['FABRICA', 'CD'] as const).map((o) => cartByOrigin[o].length > 0 && (
            <div key={o} className="mb-1">
              <p className="text-xs font-semibold text-brand">{ORIGIN[o].label}: {cartByOrigin[o].map((x) => `${x.qty}× ${x.p.name}`).join(', ')}</p>
            </div>
          ))}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação (opcional)" className="mt-1 h-9 w-full rounded-md border-2 border-line-strong bg-surface px-2 text-sm" />
          <Button onClick={submit} disabled={busy} size="lg" className="mt-2 w-full"><Send className="h-4 w-4" /> Enviar pedido (separa Fábrica/CD)</Button>
        </div>
      )}
    </div>
  );
}

function RequestList({ requests, onReceive, busy, showUnit }: { requests: Req[]; onReceive?: (id: string) => void; busy: boolean; showUnit: boolean }) {
  if (requests.length === 0) return <p className="text-sm text-ink-500">Nenhum pedido.</p>;
  return (
    <div className="space-y-2">
      {requests.map((r) => {
        const O = ORIGIN[r.origin as keyof typeof ORIGIN]; const st = STATUS[r.status] ?? STATUS.NEW;
        return (
          <div key={r.id} className="rounded-lg border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-brand"><O.icon className="mr-1 inline h-4 w-4" />{O.label} · #{r.number}{showUnit && r.unitName ? ` · ${r.unitName}` : ''}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">{new Date(r.createdAt).toLocaleString('pt-BR')} · {r.createdByName}{r.note ? ` · ${r.note}` : ''}</p>
            <ul className="mt-1 text-sm">{r.items.map((it, i) => <li key={i}>• {it.qty}× {it.name} <span className="text-xs text-ink-500">({it.measure})</span></li>)}</ul>
            {onReceive && r.status !== 'RECEIVED' && <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => onReceive(r.id)}><Check className="h-4 w-4" /> Confirmar recebimento</Button>}
          </div>
        );
      })}
    </div>
  );
}

function OpsView({ requests, post, busy }: { requests: Req[]; post: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  if (requests.length === 0) return <p className="text-sm text-ink-500">Nenhum pedido pendente da Fábrica/CD.</p>;
  const next: Record<string, string> = { NEW: 'SEPARATING', SEPARATING: 'SENT', SENT: 'RECEIVED' };
  const nextLabel: Record<string, string> = { NEW: 'Iniciar separação', SEPARATING: 'Marcar enviado', SENT: 'Marcar recebido' };
  return (
    <div className="space-y-2">
      {requests.map((r) => {
        const O = ORIGIN[r.origin as keyof typeof ORIGIN]; const st = STATUS[r.status] ?? STATUS.NEW;
        return (
          <div key={r.id} className="rounded-lg border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-brand"><O.icon className="mr-1 inline h-4 w-4" />{O.label} · #{r.number} · {r.unitName ?? ''}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">{new Date(r.createdAt).toLocaleString('pt-BR')} · {r.createdByName}{r.note ? ` · ${r.note}` : ''}</p>
            <ul className="mt-1 text-sm">{r.items.map((it, i) => <li key={i}>• {it.qty}× {it.name} <span className="text-xs text-ink-500">({it.measure})</span></li>)}</ul>
            <div className="mt-2 flex flex-wrap gap-2">
              {next[r.status] && <Button size="sm" disabled={busy} onClick={() => post({ action: 'status', id: r.id, status: next[r.status] })}>{nextLabel[r.status]}</Button>}
              <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
