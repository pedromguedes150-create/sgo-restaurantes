'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Check, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBRL } from '@/lib/utils';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { RegisterCancellationForm } from './register-cancellation-form';

interface Reason { id: string; name: string }
interface Unit { id: string; name: string }
interface Item {
  id: string; unit: string; coupon: string; operator: string | null; value: number;
  /** Caminho da foto do cupom, quando o gerente registrou na hora. */
  photo?: string | null;
  /** ISO da hora do cancelamento — só existe no registro feito na hora. */
  canceledAt?: string | null;
}

export function CancellationsClient({
  isAdmin,
  units,
  reasons,
  pending,
}: {
  isAdmin: boolean;
  units: Unit[];
  reasons: Reason[];
  pending: Item[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // estado de justificativa por item
  const [sel, setSel] = useState<Record<string, { reasonId: string; note: string }>>({});

  async function justify(id: string) {
    const s = sel[id];
    if (!s?.reasonId) {
      setMsg({ t: 'err', m: 'Selecione o motivo.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cancellations/${id}/justify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ t: 'err', m: data.error ?? 'Falha' });
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="space-y-5">
      {/* O registro com foto vem ANTES da importação: é a ação do dia a dia do
          gerente, enquanto a importação é tarefa de Admin, uma vez por dia. */}
      <RegisterCancellationForm units={units} reasons={reasons} onDone={() => router.refresh()} />

      {isAdmin && <ImportForm units={units} onDone={() => router.refresh()} />}

      <div className="space-y-2">
        <h2 className="sgo-type-11 font-semibold text-ink-900">
          Pendentes de justificativa ({pending.length})
        </h2>
        {pending.length === 0 && <p className="text-sm text-ink-500">Nenhuma pendência. 🟢</p>}
        {msg && <p className={msg.t === 'ok' ? 'text-sm text-success' : 'text-sm text-danger'}>{msg.m}</p>}

        {pending.map((c) => (
          <div key={c.id} className="rounded-lg border bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink-900">Cupom {c.coupon}</p>
              <span className="font-bold text-danger">{formatBRL(c.value)}</span>
            </div>
            <p className="text-xs text-ink-500">
              {c.unit}
              {c.operator && ` · operador ${c.operator}`}
              {c.canceledAt && ` · ${new Date(c.canceledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
            </p>
            {/* A prova. Sem ela, "cupom cancelado por engano" é só uma frase. */}
            {c.photo ? (
              <a href={`/${c.photo}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <Camera className="h-3.5 w-3.5" /> Ver foto do cupom
              </a>
            ) : (
              <p className="mt-1 text-xs font-medium text-warning">Sem foto do cupom</p>
            )}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Select
                  aria-label={`Motivo do cancelamento do cupom ${c.coupon}`}
                  placeholder="Motivo…"
                  value={sel[c.id]?.reasonId ?? ''}
                  onValueChange={(v) => setSel((s) => ({ ...s, [c.id]: { reasonId: v, note: s[c.id]?.note ?? '' } }))}
                  options={reasons.map((r) => ({ value: r.id, label: r.name }))}
                />
              </div>
              <Input
                placeholder="observação (opcional)"
                value={sel[c.id]?.note ?? ''}
                onChange={(e) => setSel((s) => ({ ...s, [c.id]: { reasonId: s[c.id]?.reasonId ?? '', note: e.target.value } }))}
                className="h-11"
              />
              <Button size="sm" disabled={busy} onClick={() => justify(c.id)} className="shrink-0">
                <Check className="h-4 w-4" /> Justificar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportForm({ units, onDone }: { units: Unit[]; onDone: () => void }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!file) { setMsg('Selecione o arquivo (Excel ou CSV) do Teknisa.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('file', file);
      const res = await fetch('/api/cancellations/import', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Importados ${data.created} cancelamento(s).` : (data.error ?? 'Falha na importação'));
      if (res.ok) { setFile(null); onDone(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 sgo-type-11 font-semibold text-ink-900">Importar Teknisa (Excel/CSV) — Admin</h2>
      <div className="space-y-2">
        <Select label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
        <input type="file" accept=".xlsx,.xls,.csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
        <p className="text-[11px] text-ink-500">Relatório Relação de Cupons SAT/NFC-e (Teknisa). Traz nº do cupom e valor; linhas de total são ignoradas.</p>
        <Button onClick={submit} disabled={busy} className="w-full"><Upload className="h-4 w-4" /> Importar</Button>
        {msg && <p className="text-sm font-medium text-ink-500">{msg}</p>}
      </div>
    </div>
  );
}
