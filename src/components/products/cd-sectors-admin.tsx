'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Banner } from '@/components/ui/ds/banner';
import { StatusBadge } from '@/components/ui/status-badge';

export interface SetorRow {
  id: string;
  name: string;
  active: boolean;
  produtos: number;
  separadores: number;
  itensEmPedidos: number;
}

async function chamar(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/products/setores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: d.error ?? 'Falha' };
  } catch {
    return { ok: false, error: 'Falha de conexão' };
  }
}

export function CdSectorsAdmin({ setores }: { setores: SetorRow[] }) {
  const router = useRouter();
  const [novo, setNovo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    if (!novo.trim()) return;
    setBusy(true);
    setErro(null);
    const r = await chamar({ action: 'create', name: novo });
    setBusy(false);
    if (!r.ok) {
      setErro(r.error ?? 'Falha');
      return;
    }
    setNovo('');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input
            label="Novo setor"
            value={novo}
            placeholder="ex.: Câmara fria"
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') criar();
            }}
          />
        </div>
        <Button loading={busy} onClick={criar}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      {erro && <Banner tone="danger" title={erro} />}

      {setores.length === 0 ? (
        <p className="text-sm text-ink-500">
          Nenhum setor cadastrado. Sem setor, todo item de pedido cai em “Sem setor cadastrado” e nenhum separador o
          enxerga.
        </p>
      ) : (
        <div className="divide-y divide-line">
          {setores.map((s) => (
            <LinhaDeSetor key={s.id} setor={s} onChange={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaDeSetor({ setor, onChange }: { setor: SetorRow; onChange: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(setor.name);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(body: Record<string, unknown>) {
    setBusy(true);
    setErro(null);
    const r = await chamar(body);
    setBusy(false);
    if (!r.ok) {
      setErro(r.error ?? 'Falha');
      return false;
    }
    onChange();
    return true;
  }

  const uso = [
    setor.produtos > 0 ? `${setor.produtos} produto(s)` : null,
    setor.separadores > 0 ? `${setor.separadores} separador(es)` : null,
  ].filter(Boolean);

  return (
    <div className="py-2">
      <div className="flex items-center gap-2">
        {editando ? (
          <>
            <div className="min-w-0 flex-1">
              <Input aria-label={`Novo nome de ${setor.name}`} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <IconButton
              aria-label="Salvar nome"
              disabled={busy}
              onClick={async () => {
                if (await executar({ action: 'rename', id: setor.id, name: nome })) setEditando(false);
              }}
            >
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton
              variant="ghost"
              aria-label="Cancelar"
              onClick={() => {
                setNome(setor.name);
                setEditando(false);
                setErro(null);
              }}
            >
              <X className="h-4 w-4" />
            </IconButton>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm text-ink-900">{setor.name}</span>
            {!setor.active && <StatusBadge tone="neutral">Desativado</StatusBadge>}
            {uso.length > 0 && <span className="shrink-0 text-xs text-ink-500">{uso.join(' · ')}</span>}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => executar({ action: 'toggle', id: setor.id, active: !setor.active })}
            >
              {setor.active ? 'Desativar' : 'Reativar'}
            </Button>
            <IconButton size="sm" variant="ghost" aria-label={`Renomear ${setor.name}`} onClick={() => setEditando(true)}>
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton
              size="sm"
              variant="danger"
              aria-label={`Excluir ${setor.name}`}
              disabled={busy}
              onClick={() => {
                if (confirm(`Excluir o setor "${setor.name}"?`)) executar({ action: 'delete', id: setor.id });
              }}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </>
        )}
      </div>
      {erro && <p className="mt-1 text-xs font-medium text-danger">{erro}</p>}
    </div>
  );
}
