'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, Plus, Copy, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { Group } from '@/components/ui/ds/group';

interface Unit { id: string; name: string }
interface Row {
  id: string;
  key: string; value: number | null; kind: 'NOTE' | 'COIN' | 'OTHER'; label: string | null;
  isSmall: boolean; isBig: boolean; countsAsBigIndicator: boolean;
  order: number; active: boolean; balance: number; system: boolean;
}
interface Data { denominations: Row[]; available: { key: string; label: string }[] }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const rowLabel = (r: { label: string | null; kind: string; value: number | null }) =>
  r.label ?? (r.kind === 'OTHER' || r.value == null ? 'Outros (PIX/caixinha)' : `${r.kind === 'COIN' ? 'Moeda' : 'Nota'} ${brl(r.value)}`);

export function CashDenominationsAdmin({ units, isAdmin }: { units: Unit[]; isAdmin: boolean }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true); setMsg(null);
    try {
      const res = await fetch(`/api/cash/denominations?unitId=${unitId}`);
      const d = await res.json().catch(() => null);
      if (!res.ok) { setMsg(d?.error ?? 'Falha ao carregar'); setData(null); }
      else setData(d);
    } catch { setMsg('Falha de conexão'); }
    setLoading(false);
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  async function post(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; result?: { copied: number; skipped: { unitName: string; key: string }[] } }> {
    try {
      const res = await fetch('/api/cash/denominations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, unitId }) });
      const d = await res.json().catch(() => ({}));
      return res.ok ? { ok: true, result: d.result } : { ok: false, error: d.error ?? 'Falha' };
    } catch { return { ok: false, error: 'Falha de conexão' }; }
  }

  async function save(key: string, patch: Record<string, unknown>) {
    setBusyKey(key); setMsg(null); setOk(null);
    const r = await post({ action: 'save', key, ...patch });
    setBusyKey(null);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    await load();
  }

  async function move(idx: number, dir: -1 | 1) {
    if (!data) return;
    const keys = data.denominations.map((d) => d.key);
    const j = idx + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[idx], keys[j]] = [keys[j], keys[idx]];
    setBusyKey('__order'); setMsg(null); setOk(null);
    const r = await post({ action: 'reorder', orderedKeys: keys });
    setBusyKey(null);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    await load();
  }

  async function del(row: Row) {
    if (!confirm(`Excluir a denominação "${rowLabel(row)}" desta unidade? (Só é possível se o saldo estiver zerado.)`)) return;
    setBusyKey(row.key); setMsg(null); setOk(null);
    try {
      const res = await fetch('/api/admin/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'cashDenomination', action: 'delete', id: row.id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error === 'Dados inválidos' ? 'Não é possível excluir: linha de sistema ou com saldo no cofre.' : (d.error ?? 'Falha')); return; }
    } catch { setMsg('Falha de conexão'); return; } finally { setBusyKey(null); }
    await load();
  }

  async function copyAll() {
    if (!confirm('Copiar esta configuração de denominações para todas as suas outras unidades? Denominações com saldo no cofre não serão desativadas.')) return;
    setBusyKey('__copy'); setMsg(null); setOk(null);
    const r = await post({ action: 'copyToAll' });
    setBusyKey(null);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    const c = r.result?.copied ?? 0;
    const sk = r.result?.skipped ?? [];
    setOk(`Copiado para ${c} unidade(s).${sk.length ? ` ${sk.length} denominação(ões) mantida(s) ativa(s) por terem saldo no cofre.` : ''}`);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">
        Defina, por unidade, quais notas/moedas existem no cofre e em quais blocos aparecem. O <strong>indicador ≥50%</strong> é separado das notas grandes (você escolhe o que conta nele).
      </p>

      <Select
        label="Unidade" value={unitId} onValueChange={setUnitId}
        options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
      />

      {loading && <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
      {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{msg}</p>}
      {ok && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{ok}</p>}

      {data && (
        <>
          <div className="hidden grid-cols-12 gap-2 px-2 text-xs font-bold uppercase tracking-wide text-ink-500 sm:grid">
            <div className="col-span-4">Denominação</div>
            <div className="col-span-2 text-center">Miúdos</div>
            <div className="col-span-2 text-center">Notas grandes</div>
            <div className="col-span-2 text-center">Indicador ≥50%</div>
            <div className="col-span-2 text-right">Ordem</div>
          </div>

          <Group>
            {data.denominations.map((r, idx) => (
              <div key={r.key} className={`p-2.5 ${r.active ? '' : 'opacity-60'}`}>
                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-12 sm:col-span-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => save(r.key, { active: !r.active })}
                        disabled={r.system || busyKey === r.key}
                        title={r.system ? 'Linha de sistema — sempre ativa' : (r.active ? 'Desativar' : 'Ativar')}
                      >
                        <StatusBadge tone={r.active ? 'success' : 'critical'}>{r.active ? 'Ativa' : 'Inativa'}</StatusBadge>
                      </button>
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{rowLabel(r)}</p>
                        {r.system
                          ? <p className="text-xs text-ink-500">Linha de sistema (PIX/caixinha)</p>
                          : r.balance !== 0 && <p className="text-xs text-ink-500">no cofre: {brl(r.balance)}</p>}
                      </div>
                    </div>
                  </div>

                  {r.system ? (
                    <div className="col-span-8 hidden text-center text-xs text-ink-500 sm:block sm:col-span-6">Não participa dos blocos</div>
                  ) : (
                    <>
                      <BlockCell label="Miúdos" checked={r.isSmall} disabled={busyKey === r.key || !r.active} onChange={(v) => save(r.key, { isSmall: v })} />
                      <BlockCell label="Notas grandes" checked={r.isBig} disabled={busyKey === r.key || !r.active} onChange={(v) => save(r.key, { isBig: v })} />
                      <BlockCell label="Indicador ≥50%" checked={r.countsAsBigIndicator} disabled={busyKey === r.key || !r.active} onChange={(v) => save(r.key, { countsAsBigIndicator: v })} />
                    </>
                  )}

                  <div className="col-span-12 flex justify-end gap-1 sm:col-span-2">
                    <Button size="sm" variant="ghost" aria-label="Subir" disabled={idx === 0 || busyKey != null} onClick={() => move(idx, -1)}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Descer" disabled={idx === data.denominations.length - 1 || busyKey != null} onClick={() => move(idx, 1)}><ChevronDown className="h-4 w-4" /></Button>
                    {isAdmin && !r.system && <Button size="sm" variant="ghost" className="text-danger" aria-label="Excluir" disabled={busyKey != null} onClick={() => del(r)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              </div>
            ))}
          </Group>

          {data.available.length > 0 && <AddFromCatalog available={data.available} onAdd={(key) => save(key, { active: true })} busy={busyKey != null} />}

          <div className="pt-1">
            <Button variant="outline" disabled={busyKey != null || units.length < 2} onClick={copyAll} className="w-full sm:w-auto">
              {busyKey === '__copy' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
              Copiar para todas as minhas unidades
            </Button>
          </div>

          <p className="rounded-lg bg-sunken/40 px-3 py-2 text-xs text-ink-500">
            As telas de operação do cofre (conferir, repor balde, troca, retirada) só passam a ler esta configuração no próximo passo. Por enquanto, elas seguem com a lista atual.
          </p>
        </>
      )}
    </div>
  );
}

function BlockCell({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="col-span-4 flex cursor-pointer items-center justify-center gap-1.5 sm:col-span-2">
      <input type="checkbox" className="h-4 w-4 accent-brand" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-xs text-ink-500 sm:hidden">{label}</span>
    </label>
  );
}

function AddFromCatalog({ available, onAdd, busy }: { available: { key: string; label: string }[]; onAdd: (key: string) => void; busy: boolean }) {
  const [key, setKey] = useState(available[0]?.key ?? '');
  useEffect(() => { if (!available.some((a) => a.key === key)) setKey(available[0]?.key ?? ''); }, [available, key]);
  return (
    <div className="rounded-lg border border-dashed p-2.5">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Adicionar denominação do catálogo</p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select
            aria-label="Denominação do catálogo" value={key} onValueChange={setKey}
            options={available.map((a) => ({ value: a.key, label: a.label }))}
          />
        </div>
        <Button size="sm" disabled={busy || !key} onClick={() => onAdd(key)} aria-label="Adicionar"><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
