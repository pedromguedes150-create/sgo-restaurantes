'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Factory, Warehouse, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';

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

/**
 * As abas de Solicitação de Produtos.
 *
 * A aba "Novo pedido" recebe a tela ATUAL por `novoPedido` em vez de ter a
 * dela. Havia duas telas de pedido na mesma página: esta, herdada do módulo
 * antigo (v1.66.0), e a de Pedidos Internos (v1.86.0+). A antiga despejava os
 * 1.184 produtos e — pior — gravava pelo caminho velho: sem
 * `ProductRequestItem`, sem setor do CD e com status `NEW`, que a tela de
 * separação nem consulta. Pedido feito por ela nascia invisível para o CD.
 */
export function ProductsClient({ isOps, myRequests, incoming, novoPedido, abas = {} }: {
  isOps: boolean; myRequests: Req[]; incoming: Req[];
  /** A tela de pedido atual, montada no servidor. */
  novoPedido: React.ReactNode;

  /** Abas liberadas para o perfil (Configurações → Perfis de acesso). */
  abas?: AcessoAbas;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'novo' | 'meus' | 'ops'>(abaInicial(abas, 'PRODUCTS', 'novo') as 'novo' | 'meus' | 'ops');
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
      <SegmentedControl
        aria-label="Seções de Pedidos de produtos"
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        options={tabs.filter((t) => podeAba(abas, t.k as string)).map((t) => ({ value: t.k as string, label: t.l }))}
      />

      {tab === 'novo' && novoPedido}
      {tab === 'meus' && <RequestList requests={myRequests} onReceive={(id) => post({ action: 'status', id, status: 'RECEIVED' })} busy={busy} showUnit={false} />}
      {tab === 'ops' && <OpsView requests={incoming} post={post} busy={busy} />}
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
              <p className="text-sm font-bold text-ink-900"><O.icon className="mr-1 inline h-4 w-4" />{O.label} · #{r.number}{showUnit && r.unitName ? ` · ${r.unitName}` : ''}</p>
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
              <p className="text-sm font-bold text-ink-900"><O.icon className="mr-1 inline h-4 w-4" />{O.label} · #{r.number} · {r.unitName ?? ''}</p>
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
