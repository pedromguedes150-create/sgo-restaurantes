'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/ds/select';
import type { PendenteDeClassificacao } from '@/lib/products/classificacao';

/**
 * O bloco "⚠ Pendentes de classificação" da fila do CD.
 *
 * Um produto sem setor não some do pedido — mas também não chega a separador
 * nenhum. Aqui a Administração define o setor NA LINHA; o cadastro é
 * corrigido e os itens dos pedidos abertos entram na fila do setor certo, na
 * hora. Nunca cai em "Secos" por padrão.
 */
export function ClassificacaoClient({ pendentes, setores }: {
  pendentes: PendenteDeClassificacao[];
  setores: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (pendentes.length === 0) return null;

  async function aplicar(productId: string) {
    const cdSectorId = escolha[productId];
    if (!cdSectorId) return;
    setBusy(productId); setMsg(null);
    try {
      const res = await fetch('/api/products/classificacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, cdSectorId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Não foi possível classificar.'); return; }
      setMsg(`Classificado: ${d.itensAtualizados} item(ns) de pedidos abertos entraram na fila do setor.`);
      router.refresh();
    } finally { setBusy(null); }
  }

  return (
    <div className="rounded-lg border-2 border-warning/40 bg-warning-bg p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
        <TriangleAlert className="h-4 w-4 text-warning" /> {pendentes.length} produto(s) sem setor definido em pedidos abertos
      </p>
      <p className="mb-2 text-xs text-ink-700">
        Estes itens estão nos pedidos, mas nenhum separador os vê. Defina o setor responsável pela separação — o item entra na fila certa na hora.
      </p>
      {msg && <p className="mb-2 rounded-md bg-surface px-3 py-2 text-sm text-ink-900">{msg}</p>}
      <ul className="divide-y divide-line rounded-lg border bg-surface">
        {pendentes.map((p) => (
          <li key={p.productId || p.name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink-900">{p.name}</span>
              <span className="block text-[11px] text-ink-500">{p.pedidos} pedido(s) · {p.unidades.join(', ')}</span>
            </span>
            {p.productId ? (
              <span className="flex items-center gap-2">
                <div className="w-44">
                  <Select
                    aria-label={`Setor de ${p.name}`} size="sm" placeholder="Escolha o setor…"
                    value={escolha[p.productId] ?? null}
                    onValueChange={(v) => setEscolha((e) => ({ ...e, [p.productId]: v }))}
                    options={setores.map((s) => ({ value: s.id, label: s.name }))}
                  />
                </div>
                <Button size="sm" disabled={busy !== null || !escolha[p.productId]} onClick={() => void aplicar(p.productId)}>
                  {busy === p.productId ? 'Aplicando…' : 'Aplicar'}
                </Button>
              </span>
            ) : (
              <span className="text-xs text-ink-500">produto excluído do catálogo — separe pelo pedido</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
