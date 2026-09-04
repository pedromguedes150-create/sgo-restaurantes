'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';

import { Plus, FileText, UserMinus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { Group } from '@/components/ui/ds/group';

type Unit = { id: string; name: string };
type Collab = { id: string; name: string };
export interface TermRow {
  id: string; collaboratorName: string; unit: string; noticeType: 'WORKED' | 'INDEMNIFIED';
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; by: string | null; reason: string;
  tenureText: string | null; ageYears: number | null; certCount: number; certDays: number; rejectionReason: string | null;
}
const NOTICE = { WORKED: 'Aviso trabalhado', INDEMNIFIED: 'Aviso indenizado' } as const;
const STw: Record<TermRow['status'], { label: string; tone: 'medium' | 'success' | 'critical' }> = {
  PENDING: { label: 'Aguardando supervisor', tone: 'medium' },
  APPROVED: { label: 'Aprovado', tone: 'success' },
  REJECTED: { label: 'Recusado', tone: 'critical' },
};

export function TerminationsClient({ canRequest, canDecide, units, collaboratorsByUnit, rows, abas = {} }: {
  canRequest: boolean; canDecide: boolean; units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; rows: TermRow[];

  /** Abas liberadas para o perfil (Configurações → Perfis de acesso). */
  abas?: AcessoAbas;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'solicitar' | 'lista'>(abaInicial(abas, 'TERMINATIONS', canRequest ? 'solicitar' : 'lista') as 'solicitar' | 'lista');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {canRequest && podeAba(abas, 'solicitar') && <button onClick={() => setTab('solicitar')} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${tab === 'solicitar' ? 'bg-brand text-on-brand' : 'border'}`}><Plus className="h-4 w-4" /> Solicitar</button>}
        {podeAba(abas, 'lista') && <button onClick={() => setTab('lista')} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${tab === 'lista' ? 'bg-brand text-on-brand' : 'border'}`}><UserMinus className="h-4 w-4" /> Solicitações</button>}
      </div>
      {tab === 'solicitar' && canRequest && <RequestForm units={units} collaboratorsByUnit={collaboratorsByUnit} onDone={() => { setTab('lista'); router.refresh(); }} />}
      {tab === 'lista' && <List rows={rows} canDecide={canDecide} onChanged={() => router.refresh()} />}
    </div>
  );
}

function RequestForm({ units, collaboratorsByUnit, onDone }: { units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; onDone: () => void }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [ctx, setCtx] = useState<{ tenure: string | null; certCount: number; certDays: number } | null>(null);
  const [noticeType, setNoticeType] = useState<'WORKED' | 'INDEMNIFIED'>('WORKED');
  const [noticeJustification, setNoticeJust] = useState('');
  const [age, setAge] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const collabs = collaboratorsByUnit[unitId] ?? [];

  async function pickCollab(id: string) {
    setCollaboratorId(id); setCtx(null);
    if (!id) return;
    const res = await fetch('/api/terminations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'context', collaboratorId: id }) });
    if (res.ok) setCtx(await res.json());
  }
  async function submit() {
    setErr(null);
    if (!unitId || !collaboratorId || !reason.trim()) { setErr('Escolha o colaborador e descreva o motivo.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/terminations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', unitId, collaboratorId, noticeType, noticeJustification, reason, ageYears: age ? Number(age) : undefined }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Falha'); return; }
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select label="Empresa" value={unitId} onValueChange={(v) => { setUnitId(v); pickCollab(''); }} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
        <Select label="Colaborador" placeholder="Selecione…" value={collaboratorId} onValueChange={pickCollab} options={collabs.map((c) => ({ value: c.id, label: c.name }))} />
      </div>

      {ctx && (
        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-surface p-2 text-center text-xs">
          <div><p className="text-ink-500">Tempo de empresa</p><p className="font-bold text-ink-900">{ctx.tenure ?? '—'}</p></div>
          <div><p className="text-ink-500">Atestados</p><p className="font-bold text-ink-900">{ctx.certCount}</p></div>
          <div><p className="text-ink-500">Dias afastado</p><p className="font-bold text-ink-900">{ctx.certDays}</p></div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select label="Tipo de aviso" value={noticeType} onValueChange={(v) => setNoticeType(v as 'WORKED' | 'INDEMNIFIED')} options={[{ value: 'WORKED', label: 'Trabalhado' }, { value: 'INDEMNIFIED', label: 'Indenizado' }]} />
        <div><Label>Idade (informe)</Label><Input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} placeholder="ex: 34" /></div>
      </div>
      <div><Label>Justificativa do tipo de aviso</Label><Input value={noticeJustification} onChange={(e) => setNoticeJust(e.target.value)} placeholder="por que trabalhado/indenizado" /></div>
      <div><Label>Motivo do desligamento</Label><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-lg border-2 border-line-strong bg-surface p-2 text-sm" placeholder="explique o motivo" /></div>

      {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
      <Button onClick={submit} disabled={busy || !collaboratorId} size="lg" className="w-full"><UserMinus className="h-5 w-5" /> Enviar ao supervisor</Button>
    </div>
  );
}

function List({ rows, canDecide, onChanged }: { rows: TermRow[]; canDecide: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState('');
  async function decide(id: string, approve: boolean) {
    let rejectionReason: string | undefined;
    if (!approve) { const m = prompt('Motivo da recusa:'); if (!m) return; rejectionReason = m; }
    setBusy(id);
    try {
      const res = await fetch('/api/terminations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decide', id, approve, rejectionReason }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error ?? 'Falha'); return; }
      onChanged();
    } finally { setBusy(''); }
  }
  if (rows.length === 0) return <p className="text-sm text-ink-500">Nenhuma solicitação.</p>;
  return (
    <Group>
      {rows.map((r) => (
        <div key={r.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{r.collaboratorName}</p>
              <p className="text-xs text-ink-500">{r.unit} · {NOTICE[r.noticeType]}{r.by ? ` · ${r.by}` : ''}</p>
            </div>
            <StatusBadge tone={STw[r.status].tone}>{STw[r.status].label}</StatusBadge>
          </div>
          <p className="mt-1 text-xs text-ink-500">{r.tenureText ?? 'tempo de empresa —'} · {r.certCount} atestado(s) / {r.certDays} dia(s){r.ageYears ? ` · ${r.ageYears} anos` : ''}</p>
          <p className="mt-1 text-sm">{r.reason}</p>
          {r.rejectionReason && <p className="mt-1 text-xs text-danger">Recusado: {r.rejectionReason}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a href={`/modulos/desligamentos/${r.id}/relatorio`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold text-brand"><FileText className="h-4 w-4" /> Relatório (PDF)</a>
            {canDecide && r.status === 'PENDING' && (
              <>
                <Button size="sm" variant="gold" disabled={busy === r.id} onClick={() => decide(r.id, true)}><Check className="h-4 w-4" /> Aprovar</Button>
                <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => decide(r.id, false)}><X className="h-4 w-4" /> Recusar</Button>
              </>
            )}
          </div>
        </div>
      ))}
    </Group>
  );
}
