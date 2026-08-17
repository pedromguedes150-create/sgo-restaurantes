'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles, Trash2, FileText, Stethoscope, CalendarDays, TrendingUp, BarChart3, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { compressImage } from '@/lib/image-compress';
import { CERT_TYPE_LABELS } from '@/lib/certificates/labels';
import type { CertListItem, CertReport } from '@/lib/certificates/query';
import type { CertificateType } from '@prisma/client';
import { Group } from '@/components/ui/ds/group';

/** Últimos 12 meses a partir do selecionado — o <input type="month"> abria qualquer mês, mas o painel só tem dado recente. */
function ultimosMeses(atual: string) {
  const [y, m] = atual.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value: v, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  });
}

type Unit = { id: string; name: string };
type Collab = { id: string; name: string };

const TYPE_OPTS: { v: CertificateType; label: string }[] = [
  { v: 'FULL_DAY', label: 'Dias de afastamento' },
  { v: 'HOURS', label: 'Atestado de horas (consulta)' },
  { v: 'COMPANION', label: 'Acompanhamento de familiar' },
];

function daysBetween(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 1;
  const a = Date.parse(start + 'T00:00:00Z'), b = Date.parse(end + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return 1;
  return Math.floor((b - a) / 86_400_000) + 1;
}
function fmtDate(s: string | null): string { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }

export function CertificatesClient({ canLaunch, isAdmin, showCid, ym, units, collaboratorsByUnit, rows, report }: {
  canLaunch: boolean; isAdmin: boolean; showCid: boolean; ym: string;
  units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; rows: CertListItem[]; report: CertReport;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'lancar' | 'historico' | 'painel'>(canLaunch ? 'lancar' : 'painel');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {canLaunch && <TabBtn active={tab === 'lancar'} onClick={() => setTab('lancar')} icon={<Plus className="h-4 w-4" />}>Lançar</TabBtn>}
        <TabBtn active={tab === 'historico'} onClick={() => setTab('historico')} icon={<FileText className="h-4 w-4" />}>Histórico</TabBtn>
        <TabBtn active={tab === 'painel'} onClick={() => setTab('painel')} icon={<BarChart3 className="h-4 w-4" />}>Painel</TabBtn>
      </div>

      {tab === 'lancar' && canLaunch && (
        <LaunchForm units={units} collaboratorsByUnit={collaboratorsByUnit} showCid={showCid} onSaved={() => { setTab('historico'); router.refresh(); }} />
      )}
      {tab === 'historico' && <History rows={rows} isAdmin={isAdmin} showCid={showCid} onChanged={() => router.refresh()} />}
      {tab === 'painel' && <Panel report={report} ym={ym} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${active ? 'bg-brand text-on-brand' : 'border'}`}>{icon}{children}</button>
  );
}

/* ───────────────────────── Lançar ───────────────────────── */
function LaunchForm({ units, collaboratorsByUnit, showCid, onSaved }: {
  units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; showCid: boolean; onSaved: () => void;
}) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [type, setType] = useState<CertificateType>('FULL_DAY');
  const [issueDate, setIssueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorCrm, setDoctorCrm] = useState('');
  const [cid, setCid] = useState('');
  const [cidDescription, setCidDescription] = useState('');
  const [observation, setObservation] = useState('');
  const [attachmentPath, setAttachmentPath] = useState('');
  const [aiName, setAiName] = useState('');
  const [low, setLow] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok' | 'info'; text: string } | null>(null);

  const collabs = collaboratorsByUnit[unitId] ?? [];
  const days = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate]);
  const ring = (k: string) => (low.has(k) ? 'ring-2 ring-warning' : '');

  async function readWithAI(file: File) {
    if (!unitId) { setMsg({ kind: 'err', text: 'Escolha a unidade primeiro.' }); return; }
    setReading(true); setMsg(null);
    try {
      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      const toSend = isImage ? await compressImage(file).catch(() => file) : file;
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('file', toSend);
      const res = await fetch('/api/certificates/read', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ kind: 'err', text: data.error ?? 'Falha ao enviar o arquivo.' }); return; }
      setAttachmentPath(data.attachmentPath ?? '');
      const ai = data.ai;
      if (!ai) { setMsg({ kind: 'info', text: 'Arquivo anexado. PDF não é lido por IA — preencha os campos.' }); return; }
      if (!ai.configured) { setMsg({ kind: 'info', text: 'Arquivo anexado. Leitura por IA indisponível — preencha os campos.' }); return; }
      if (!ai.ok) { setMsg({ kind: 'info', text: 'Anexado, mas a IA não conseguiu ler. Preencha manualmente.' }); return; }
      const f = ai.fields ?? {};
      if (f.type) setType(f.type);
      if (f.issueDate) setIssueDate(f.issueDate);
      if (f.startDate) setStartDate(f.startDate);
      if (f.endDate) setEndDate(f.endDate || f.startDate);
      if (f.hours != null) setHours(String(f.hours));
      if (f.doctorName) setDoctorName(f.doctorName);
      if (f.doctorCrm) setDoctorCrm(f.doctorCrm);
      if (f.cid) setCid(f.cid);
      if (f.cidDescription) setCidDescription(f.cidDescription);
      if (f.collaboratorName) setAiName(f.collaboratorName);
      setLow(new Set(Array.isArray(ai.lowConfidence) ? ai.lowConfidence : []));
      setMsg({ kind: 'ok', text: 'IA preencheu o que conseguiu ler. Confira os campos destacados em amarelo e selecione o colaborador.' });
    } finally { setReading(false); }
  }

  async function save() {
    if (!unitId || !collaboratorId || !startDate || !endDate) { setMsg({ kind: 'err', text: 'Unidade, colaborador e datas são obrigatórios.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/certificates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId, collaboratorId, type, issueDate: issueDate || undefined,
          startDate, endDate: type === 'HOURS' ? startDate : endDate,
          hours: type === 'HOURS' && hours ? Number(hours) : undefined,
          doctorName: doctorName || undefined, doctorCrm: doctorCrm || undefined,
          cid: cid || undefined, cidDescription: cidDescription || undefined, observation: observation || undefined,
          attachmentPath: attachmentPath || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ kind: 'err', text: data.error ?? 'Falha ao salvar.' }); return; }
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {/* Foto + IA */}
      <div className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink-500"><Sparkles className="h-4 w-4" /> Foto do atestado (a IA lê)</h2>
        <input
          type="file" accept="image/*,application/pdf" capture="environment"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) readWithAI(f); }}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-on-brand"
        />
        {reading && <p className="mt-2 text-sm text-ink-900">Lendo o atestado com IA…</p>}
        {attachmentPath && !reading && (
          <a href={`/${attachmentPath}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand underline"><FileText className="h-3.5 w-3.5" /> Ver anexo</a>
        )}
        {aiName && <p className="mt-1 text-xs text-ink-500">IA leu o nome: <b>{aiName}</b> — selecione o colaborador correspondente abaixo.</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Unidade" value={unitId}
          onValueChange={(v) => { setUnitId(v); setCollaboratorId(''); }}
          options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
        />
        <Select
          label="Colaborador" placeholder="Selecione…" className={ring('collaboratorName')}
          value={collaboratorId} onValueChange={setCollaboratorId}
          options={collabs.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>

      <Select
        label="Tipo" className={ring('type')} value={type}
        onValueChange={(v) => setType(v as CertificateType)}
        options={TYPE_OPTS.map((t) => ({ value: t.v, label: t.label }))}
      />

      <div className="grid grid-cols-2 gap-2">
        <DatePicker label="Início do afastamento" className={ring('startDate')} value={startDate || null} onValueChange={(v) => setStartDate(v ?? '')} />
        {type === 'HOURS'
          ? <div><Label>Horas</Label><Input inputMode="decimal" className={ring('hours')} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="ex: 2" /></div>
          : <DatePicker label="Fim do afastamento" className={ring('endDate')} min={startDate || undefined} value={endDate || null} onValueChange={(v) => setEndDate(v ?? '')} />}
      </div>
      {type !== 'HOURS' && startDate && endDate && (
        <p className="text-xs font-semibold text-ink-900">{days} dia(s) de afastamento — serão marcados como “Atestado” na Escala.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <DatePicker label="Data de emissão" className={ring('issueDate')} value={issueDate || null} onValueChange={(v) => setIssueDate(v ?? '')} />
        <div><Label>Médico (CRM)</Label><Input className={ring('doctorCrm')} value={doctorCrm} onChange={(e) => setDoctorCrm(e.target.value)} placeholder="CRM" /></div>
      </div>
      <div><Label>Nome do médico</Label><Input className={ring('doctorName')} value={doctorName} onChange={(e) => setDoctorName(e.target.value)} /></div>

      {showCid && (
        <div className="space-y-2 rounded-lg border border-danger/30 bg-danger/5 p-2">
          <p className="text-xs font-semibold text-danger">Dados sensíveis (LGPD) — visíveis só ao RH/Admin</p>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>CID</Label><Input className={ring('cid')} value={cid} onChange={(e) => setCid(e.target.value)} placeholder="ex: J11" /></div>
            <div className="col-span-2"><Label>O que é (descrição)</Label><Input className={ring('cidDescription')} value={cidDescription} onChange={(e) => setCidDescription(e.target.value)} placeholder="a IA preenche o significado do CID" /></div>
          </div>
        </div>
      )}
      <div><Label>Observação</Label><Input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="opcional" /></div>

      {msg && <p className={`text-sm font-medium ${msg.kind === 'err' ? 'text-danger' : msg.kind === 'ok' ? 'text-success' : 'text-ink-900'}`}>{msg.text}</p>}
      <Button className="w-full" disabled={busy || reading || !unitId || !collaboratorId || !startDate} onClick={save}><Plus className="h-4 w-4" /> Salvar atestado</Button>
    </div>
  );
}

/* ───────────────────────── Histórico ───────────────────────── */
function History({ rows, isAdmin, showCid, onChanged }: { rows: CertListItem[]; isAdmin: boolean; showCid: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState('');
  async function remove(id: string) {
    if (!confirm('Excluir este atestado? Reverte a marcação de “Atestado” na Escala e fica na Auditoria. Não pode ser desfeito.')) return;
    setBusy(id);
    try {
      const res = await fetch('/api/admin/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'medicalCertificate', action: 'delete', id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? 'Falha'); return; }
      onChanged();
    } finally { setBusy(''); }
  }

  if (rows.length === 0) return <p className="text-sm text-ink-500">Nenhum atestado registrado ainda.</p>;
  return (
    <Group>
      {rows.map((r) => (
        <div key={r.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{r.collaboratorName}</p>
              <p className="text-xs text-ink-500">{r.unitName} · {r.by ?? '—'}</p>
            </div>
            <StatusBadge tone={r.type === 'COMPANION' ? 'medium' : r.type === 'HOURS' ? 'neutral' : 'success'}>{CERT_TYPE_LABELS[r.type]}</StatusBadge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span><b>{r.type === 'HOURS' ? `${r.hours ?? '—'} h` : `${r.days} dia(s)`}</b></span>
            <span className="text-ink-500">{fmtDate(r.startDate)}{r.type !== 'HOURS' ? ` → ${fmtDate(r.endDate)}` : ''}</span>
            {r.doctorCrm && <span className="text-ink-500">CRM {r.doctorCrm}</span>}
            {showCid && r.cid && <span className="text-ink-500">CID {r.cid}{r.cidDescription ? ` — ${r.cidDescription}` : ''}</span>}
            {r.attachmentPath && <a href={`/${r.attachmentPath}`} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">Ver anexo</a>}
          </div>
          {isAdmin && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" className="text-danger" disabled={busy === r.id} onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /> Excluir</Button>
            </div>
          )}
        </div>
      ))}
    </Group>
  );
}

/* ───────────────────────── Painel ───────────────────────── */
function Panel({ report, ym }: { report: CertReport; ym: string }) {
  const router = useRouter();
  const maxTrend = Math.max(1, ...report.monthlyTrend.map((t) => t.days));
  const maxWd = Math.max(1, ...report.byWeekday.map((w) => w.count));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Label className="text-xs">Mês</Label>
          <div className="w-52">
            <Select
              aria-label="Mês" className="capitalize" value={ym}
              onValueChange={(v) => router.push(`/modulos/atestados?mes=${v}`)}
              options={ultimosMeses(ym)}
            />
          </div>
        </div>
        <a href={`/modulos/atestados/relatorio?mes=${ym}`} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold text-brand"><Printer className="h-4 w-4" /> Relatório (PDF)</a>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard icon={<Stethoscope className="h-5 w-5" />} label="Atestados no mês" value={String(report.totals.count)} />
        <KpiCard icon={<CalendarDays className="h-5 w-5" />} label="Dias perdidos" value={String(report.totals.days)} />
      </div>

      {/* Ranking por unidade */}
      <div className="rounded-lg border bg-surface p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-900"><TrendingUp className="h-4 w-4" /> Por unidade (mais dias perdidos)</h3>
        {report.byUnit.length === 0 ? <p className="text-sm text-ink-500">Sem atestados neste mês.</p> : (
          <div className="space-y-1.5">
            {report.byUnit.map((u) => (
              <div key={u.unitId} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{u.unitName}</span>
                  <span className="shrink-0 text-ink-500">{u.days} dia(s) · {u.count} atest. · <b className={u.absenteeismPct >= 5 ? 'text-danger' : 'text-brand'}>{u.absenteeismPct}%</b></span>
                </div>
                <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (u.days / Math.max(1, report.byUnit[0].days)) * 100)}%` }} /></div>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-ink-500">% = taxa de absenteísmo (dias de atestado ÷ colaboradores × dias do mês).</p>
          </div>
        )}
      </div>

      {/* Tendência mensal */}
      <div className="rounded-lg border bg-surface p-3">
        <h3 className="mb-2 text-sm font-bold text-ink-900">Tendência (12 meses) — dias perdidos</h3>
        <div className="flex items-end gap-1" style={{ height: 90 }}>
          {report.monthlyTrend.map((t) => (
            <div key={t.ym} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${t.ym}: ${t.days} dia(s)`}>
              <div className="w-full rounded-t bg-brand/80" style={{ height: `${(t.days / maxTrend) * 70}px` }} />
              <span className="text-[9px] text-ink-500">{t.ym.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Por dia da semana + por tipo */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border bg-surface p-3">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Por dia da semana (início)</h3>
          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {report.byWeekday.map((w) => (
              <div key={w.weekday} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${w.label}: ${w.count}`}>
                <div className="w-full rounded-t bg-brand/70" style={{ height: `${(w.count / maxWd) * 60}px` }} />
                <span className="text-[9px] text-ink-500">{w.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Por tipo</h3>
          {report.byType.length === 0 ? <p className="text-sm text-ink-500">—</p> : (
            <ul className="space-y-1 text-sm">
              {report.byType.map((t) => <li key={t.type} className="flex justify-between"><span>{CERT_TYPE_LABELS[t.type]}</span><span className="text-ink-500">{t.count} · {t.days} dia(s)</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-surface p-3">
      <div className="flex items-center gap-2 text-ink-500">{icon}<span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
      <p className="mt-1 text-2xl font-black text-ink-900">{value}</p>
    </div>
  );
}
