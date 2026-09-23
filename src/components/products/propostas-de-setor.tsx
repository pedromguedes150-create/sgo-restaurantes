'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/ds/select';
import type { PropostaPendente } from '@/lib/products/propostas-setor';

/**
 * FILA DE APROVAÇÃO DAS PROPOSTAS DA IA.
 *
 * A IA sugere o setor; aqui o Coordenador confere e decide. Cada linha mostra o
 * setor ATUAL do produto e o PROPOSTO, lado a lado, com o motivo da IA — o que
 * ele confere antes de aprovar. Pode aprovar como está, editar (trocar o setor
 * no seletor e aprovar) ou rejeitar. Só na aprovação o setor é aplicado.
 */

interface Setor { id: string; name: string }

export function PropostasDeSetor({ propostas, setores }: { propostas: PropostaPendente[]; setores: Setor[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /* Edição por linha: o setor escolhido pelo Coordenador vence o proposto. */
  const [editado, setEditado] = useState<Record<string, string>>({});

  const valorDe = (p: PropostaPendente) => editado[p.id] ?? p.proposedSectorId ?? '';

  async function decidir(body: Record<string, unknown>) {
    setBusy(true); setErro(null); setMsg(null);
    try {
      const res = await fetch('/api/products/propostas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErro(String(d.error ?? 'Falha ao decidir a proposta.')); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  async function aprovarTodas() {
    setBusy(true); setErro(null); setMsg(null);
    try {
      const res = await fetch('/api/products/propostas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'aprovarTodas' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErro(String(d.error ?? 'Falha ao aprovar em lote.')); return; }
      setMsg(`${d.aprovadas} aprovada(s)${d.ignoradas > 0 ? `, ${d.ignoradas} sem setor proposto ficaram de fora` : ''}.`);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (propostas.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border-2 border-brand/40 bg-brand/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 sgo-type-17 font-semibold text-ink-900">
            <Sparkles className="h-4 w-4 text-brand" /> Propostas da IA aguardando aprovação
          </p>
          <p className="sgo-type-13 text-ink-700">
            <b>{propostas.length}</b> proposta(s). A IA sugeriu o setor; confira e aprove — só então o produto é reclassificado.
          </p>
        </div>
        <Button size="sm" disabled={busy} onClick={() => void aprovarTodas()}>
          <Check className="h-4 w-4" /> Aprovar todas ({propostas.length})
        </Button>
      </div>

      {msg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{msg}</p>}
      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}

      <div className="max-h-[32rem] space-y-1.5 overflow-y-auto">
        {propostas.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate sgo-type-15 font-medium text-ink-900">{p.productName}</p>
              <p className="sgo-type-11 text-ink-500">
                {p.category}
                {p.setorAtualNome
                  ? <span> · atual: <b className="text-ink-700">{p.setorAtualNome}</b></span>
                  : <span className="text-warning"> · sem setor hoje</span>}
                {p.reason ? <span className="text-brand"> · IA: {p.reason}</span> : null}
              </p>
            </div>
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-ink-400 sm:block" />
            {/* Setor proposto, editável na própria linha. */}
            <div className="w-48 shrink-0">
              <Select
                aria-label={`Setor proposto para ${p.productName}`}
                size="sm"
                value={valorDe(p)}
                onValueChange={(v) => setEditado((e) => ({ ...e, [p.id]: v }))}
                placeholder="Escolha…"
                options={setores.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm" disabled={busy || !valorDe(p)}
                onClick={() => void decidir({ action: 'aprovar', id: p.id, cdSectorId: valorDe(p) })}
              >
                <Check className="h-3.5 w-3.5" /> Aprovar
              </Button>
              <Button
                size="sm" variant="outline" disabled={busy}
                onClick={() => void decidir({ action: 'rejeitar', id: p.id })}
              >
                <X className="h-3.5 w-3.5" /> Rejeitar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
