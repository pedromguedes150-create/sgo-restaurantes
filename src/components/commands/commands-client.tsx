'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Search, RotateCcw, XCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';

interface Divergence {
  id: string;
  number: number;
  status: 'OPEN' | 'INVESTIGATING' | 'CLOSED';
  observation: string | null;
  reporter: string | null;
}

export function CommandsClient({
  unitId,
  canResolve,
  isAdmin,
  hasConfig,
  todayDone,
  openDivergences,
}: {
  unitId: string;
  canResolve: boolean;
  isAdmin: boolean;
  hasConfig: boolean;
  todayDone: boolean;
  openDivergences: Divergence[];
}) {
  const router = useRouter();
  const [absent, setAbsent] = useState('');
  const [observation, setObservation] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ t: 'err', m: data.error ?? 'Falha' });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMsg({ t: 'err', m: 'Falha de conexão' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function allPresent() {
    if (await post('/api/commands/count', { unitId, allPresent: true })) setMsg({ t: 'ok', m: 'Registrado: todas presentes ✓' });
  }

  async function submitAbsent() {
    const nums = absent
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n));
    if (nums.length === 0) {
      setMsg({ t: 'err', m: 'Informe os números ausentes ou use "Todas presentes".' });
      return;
    }
    const ok = await post('/api/commands/count', { unitId, allPresent: false, absentNumbers: nums, observation });
    if (ok) {
      setAbsent('');
      setObservation('');
      setMsg({ t: 'ok', m: 'Divergências registradas e Supervisor alertado.' });
    }
  }

  if (!hasConfig) {
    return (
      <p className="rounded-lg bg-medium/10 px-3 py-2 text-sm font-medium text-[#92600A]">
        Sequência de comandas ainda não configurada para esta unidade (Admin → Configurações).
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Contagem do dia */}
      <div className="space-y-3">
        {todayDone && (
          <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
            Contagem de hoje já registrada (pode reenviar para corrigir).
          </p>
        )}
        <Button onClick={allPresent} disabled={busy} size="lg" className="w-full" variant="default">
          <Check className="h-5 w-5" /> Todas presentes
        </Button>

        <div className="rounded-lg border p-3">
          <Label htmlFor="absent">Comandas ausentes (números separados por vírgula)</Label>
          <Input id="absent" inputMode="numeric" placeholder="ex: 12, 45, 78" value={absent} onChange={(e) => setAbsent(e.target.value)} className="mt-1.5" />
          <Label htmlFor="obs" className="mt-3 block">Observação (obrigatória se houver ausentes)</Label>
          <Input id="obs" value={observation} onChange={(e) => setObservation(e.target.value)} className="mt-1.5" />
          <Button onClick={submitAbsent} disabled={busy} className="mt-3 w-full" variant="gold">
            Registrar ausentes
          </Button>
        </div>

        {msg && (
          <p className={msg.t === 'ok' ? 'text-sm font-medium text-success' : 'text-sm font-medium text-critical'}>{msg.m}</p>
        )}
      </div>

      {/* Divergências em aberto */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Divergências em aberto ({openDivergences.length})
        </h2>
        {openDivergences.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma divergência aberta. 🟢</p>}
        {openDivergences.map((d) => (
          <div key={d.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-brand">Comanda nº {d.number}</p>
              <StatusBadge tone={d.status === 'OPEN' ? 'critical' : 'medium'}>
                {d.status === 'OPEN' ? '🔴 Aberta' : '🟡 Em apuração'}
              </StatusBadge>
            </div>
            {d.observation && <p className="mt-1 text-sm text-muted-foreground">{d.observation}</p>}
            {canResolve && (
              <div className="mt-2 flex flex-wrap gap-2">
                {d.status === 'OPEN' && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => post(`/api/commands/divergences/${d.id}`, { action: 'investigate' })}>
                    <Search className="h-4 w-4" /> Em apuração
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => post(`/api/commands/divergences/${d.id}`, { action: 'close', outcome: 'RECOVERED' })}>
                  <RotateCcw className="h-4 w-4" /> Recuperada
                </Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => post(`/api/commands/divergences/${d.id}`, { action: 'close', outcome: 'LOST' })}>
                  <XCircle className="h-4 w-4" /> Perdida (baixa)
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reposição (Admin) */}
      {isAdmin && <ReplacementForm unitId={unitId} onDone={() => router.refresh()} />}
    </div>
  );
}

function ReplacementForm({ unitId, onDone }: { unitId: string; onDone: () => void }) {
  const [number, setNumber] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = parseInt(number, 10);
    if (Number.isNaN(n)) return;
    setBusy(true);
    try {
      await fetch('/api/commands/replacements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, number: n, note }),
      });
      setNumber('');
      setNote('');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Reposição (Admin)</h2>
      <div className="flex gap-2">
        <Input inputMode="numeric" placeholder="nº" value={number} onChange={(e) => setNumber(e.target.value)} className="w-24" />
        <Input placeholder="observação" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={submit} disabled={busy} size="icon" aria-label="Repor">
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
