'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Group } from '@/components/ui/ds/group';
import { formatBRL } from '@/lib/utils';

interface Unit { id: string; name: string }
export interface RateRow { id: string; value: number; active: boolean }

/**
 * Configuração "Valor da hora extra (por hora)" (v1.130.0): por unidade, a
 * lista dos valores que o gerente pode ESCOLHER ao lançar Hora Extra. Sem tipo
 * de dia — isso é regra do freelancer. Desativar tira da lista sem apagar.
 */
export function OvertimeRatesConfig({ units, rates }: { units: Unit[]; rates: Record<string, RateRow[]> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [novo, setNovo] = useState<Record<string, string>>({});

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); return false; }
      router.refresh(); return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        Por unidade: os valores/hora <b>autorizados</b> para Hora Extra. No lançamento, o gerente escolhe um deles — não digita valor. Desativar tira o valor da lista; solicitações já feitas guardam o valor usado e não mudam.
      </p>
      <Group>
        {units.map((u) => {
          const lista = rates[u.id] ?? [];
          return (
            <div key={u.id} className="p-3">
              <p className="mb-2 text-sm font-semibold text-ink-900">{u.name}</p>
              {lista.length === 0 && <p className="mb-2 text-xs text-warning">Nenhum valor cadastrado — o gerente desta unidade não consegue lançar Hora Extra até haver um.</p>}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {lista.map((r) => (
                  <span key={r.id} className={`inline-flex items-center gap-1 rounded-pill border px-2 py-1 text-xs font-semibold ${r.active ? 'border-brand/40 bg-brand-tint text-brand' : 'border-line bg-canvas text-ink-400 line-through'}`}>
                    {formatBRL(r.value)}/h
                    <button type="button" disabled={busy} aria-label={r.active ? 'Desativar' : 'Ativar'} title={r.active ? 'Desativar' : 'Ativar'} onClick={() => post({ entity: 'overtimeRate', action: 'toggle', id: r.id, active: !r.active })} className="rounded p-0.5 hover:bg-surface">
                      {r.active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </button>
                    <button type="button" disabled={busy} aria-label="Excluir" title="Excluir" onClick={() => { if (confirm(`Excluir ${formatBRL(r.value)}/h de ${u.name}?`)) post({ entity: 'overtimeRate', action: 'delete', id: r.id }); }} className="rounded p-0.5 text-danger hover:bg-surface">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-end gap-1.5">
                <div className="w-36">
                  <Input label="Novo valor (R$/h)" inputSize="sm" inputMode="decimal" placeholder="ex.: 25,00" value={novo[u.id] ?? ''} onChange={(e) => setNovo((n) => ({ ...n, [u.id]: e.target.value }))} />
                </div>
                <Button size="sm" variant="secondary" disabled={busy || !(novo[u.id] ?? '').trim()} onClick={async () => { if (await post({ entity: 'overtimeRate', action: 'add', unitId: u.id, value: Number((novo[u.id] ?? '0').replace(/\./g, '').replace(',', '.')) })) setNovo((n) => ({ ...n, [u.id]: '' })); }}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </div>
          );
        })}
      </Group>
    </div>
  );
}
