'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LargeTitle } from '@/components/layout/page-chrome';
import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';

import { Plus, FileText, UserMinus, Check, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { Group } from '@/components/ui/ds/group';
import { tipoSemAviso } from '@/lib/rh/saida/regras';
import type { RhNoticeMode, RhTerminationKind, RhTerminationReason } from '@prisma/client';

type Unit = { id: string; name: string };
type Collab = { id: string; name: string };
type Opcao<T extends string> = { value: T; label: string };
export type EnvioRh = 'NAO_ENVIADO' | 'AGUARDANDO' | 'ENVIADO' | 'COM_PROBLEMA';
export interface TermRow {
  id: string; collaboratorName: string; unit: string; noticeType: 'WORKED' | 'INDEMNIFIED' | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; by: string | null; reason: string;
  tenureText: string | null; ageYears: number | null; certCount: number; certDays: number; rejectionReason: string | null;
  /** Contrato do RH (v1.168.0); nulos num pedido anterior à integração. */
  tipoLabel: string | null; avisoLabel: string | null; motivoLabel: string | null; terminationDate: string | null; temCarta: boolean;
  envio: EnvioRh; rhProcesso: string | null; rhPrazoLegal: string | null; situacaoRotulo: string | null;
}
const NOTICE = { WORKED: 'Aviso trabalhado', INDEMNIFIED: 'Aviso indenizado' } as const;
const STw: Record<TermRow['status'], { label: string; tone: 'medium' | 'success' | 'critical' }> = {
  PENDING: { label: 'Aguardando aprovação', tone: 'medium' },
  APPROVED: { label: 'Aprovado', tone: 'success' },
  REJECTED: { label: 'Recusado', tone: 'critical' },
};
/** O gerente vê o estado do envio sem o detalhe técnico (que é da tela do Admin). */
const ENVIO: Record<EnvioRh, { label: string; tone: 'neutral' | 'medium' | 'success' | 'critical' } | null> = {
  NAO_ENVIADO: null,
  AGUARDANDO: { label: 'Enviando ao RH…', tone: 'medium' },
  ENVIADO: { label: 'Recebido pelo RH', tone: 'success' },
  COM_PROBLEMA: { label: 'Envio ao RH em revisão pelo Administrador', tone: 'critical' },
};

function dataBR(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function TerminationsClient({ canRequest, canDecide, units, collaboratorsByUnit, rows, abas = {}, subtitulo, tipos = [], modalidades = [], motivos = [], hoje = new Date().toISOString().slice(0, 10) }: {
  subtitulo?: React.ReactNode;
  canRequest: boolean; canDecide: boolean; units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; rows: TermRow[];
  abas?: AcessoAbas;
  /** Listas do contrato do RH (v1.168.0); a página de servidor passa. */
  tipos?: Opcao<RhTerminationKind>[]; modalidades?: Opcao<RhNoticeMode>[]; motivos?: Opcao<RhTerminationReason>[];
  /** Dia de hoje (AAAA-MM-DD) para o padrão da data. */
  hoje?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'solicitar' | 'lista'>(abaInicial(abas, 'TERMINATIONS', canRequest ? 'solicitar' : 'lista') as 'solicitar' | 'lista');
  return (
    <div className="space-y-4">
      <LargeTitle
        title="Desligamentos"
        subtitle={subtitulo}
        tabs={[
          ...(canRequest && podeAba(abas, 'solicitar') ? [{ value: 'solicitar' as const, label: 'Solicitar', icon: <Plus className="h-3.5 w-3.5" /> }] : []),
          ...(podeAba(abas, 'lista') ? [{ value: 'lista' as const, label: 'Solicitações', icon: <UserMinus className="h-3.5 w-3.5" /> }] : []),
        ].map((o) => ({ label: o.label, icon: o.icon, active: tab === o.value, testId: `aba-${o.value}`, onClick: () => setTab(o.value) }))}
      />
      {tab === 'solicitar' && canRequest && <RequestForm units={units} collaboratorsByUnit={collaboratorsByUnit} tipos={tipos} modalidades={modalidades} motivos={motivos} hoje={hoje} onDone={() => { setTab('lista'); router.refresh(); }} />}
      {tab === 'lista' && <List rows={rows} canDecide={canDecide} onChanged={() => router.refresh()} />}
    </div>
  );
}

function RequestForm({ units, collaboratorsByUnit, tipos, modalidades, motivos, hoje, onDone }: {
  units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; tipos: Opcao<RhTerminationKind>[]; modalidades: Opcao<RhNoticeMode>[]; motivos: Opcao<RhTerminationReason>[]; hoje: string; onDone: () => void;
}) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [ctx, setCtx] = useState<{ tenure: string | null; certCount: number; certDays: number; temCpf: boolean } | null>(null);
  const [kind, setKind] = useState<RhTerminationKind | ''>('');
  const [mode, setMode] = useState<RhNoticeMode | ''>('');
  const [reasonCode, setReasonCode] = useState<RhTerminationReason | ''>('');
  const [terminationDate, setTerminationDate] = useState(hoje);
  const [reason, setReason] = useState('');
  const [age, setAge] = useState('');
  const [letterPath, setLetterPath] = useState('');
  const [letterName, setLetterName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const collabs = collaboratorsByUnit[unitId] ?? [];
  const semAviso = kind !== '' && tipoSemAviso(kind);
  const pedidoDemissao = kind === 'PEDIDO_DEMISSAO';

  async function pickCollab(id: string) {
    setCollaboratorId(id); setCtx(null);
    if (!id) return;
    const res = await fetch('/api/terminations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'context', collaboratorId: id }) });
    if (res.ok) setCtx(await res.json());
  }
  async function enviarCarta(file: File | null) {
    setLetterPath(''); setLetterName('');
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('carta', file);
      const res = await fetch('/api/terminations/carta', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Falha ao enviar a carta'); return; }
      setLetterPath(d.letterPath); setLetterName(file.name);
    } finally { setBusy(false); }
  }
  async function submit() {
    setErr(null);
    if (!unitId || !collaboratorId) { setErr('Escolha o colaborador.'); return; }
    if (!kind) { setErr('Escolha o tipo do desligamento.'); return; }
    if (!reasonCode) { setErr('Escolha o motivo.'); return; }
    if (!semAviso && !mode) { setErr('Escolha a modalidade do aviso prévio.'); return; }
    if (reasonCode === 'OUTRO' && !reason.trim()) { setErr('Com motivo "Outro", a justificativa é obrigatória.'); return; }
    if (pedidoDemissao && !letterPath) { setErr('Pedido de demissão exige a carta assinada (PDF).'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/terminations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', unitId, collaboratorId, terminationKind: kind, noticeMode: semAviso ? null : mode, reasonCode, terminationDate, reason, letterPath: letterPath || null, ageYears: age ? Number(age) : undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Falha'); return; }
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select label="Empresa" value={unitId} onValueChange={(v) => { setUnitId(v); pickCollab(''); setLetterPath(''); setLetterName(''); }} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
        <Select label="Colaborador" placeholder="Selecione…" value={collaboratorId} onValueChange={pickCollab} options={collabs.map((c) => ({ value: c.id, label: c.name }))} searchable />
      </div>

      {ctx && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-surface p-2 text-center text-xs">
            <div><p className="text-ink-500">Tempo de empresa</p><p className="font-bold text-ink-900">{ctx.tenure ?? '—'}</p></div>
            <div><p className="text-ink-500">Atestados</p><p className="font-bold text-ink-900">{ctx.certCount}</p></div>
            <div><p className="text-ink-500">Dias afastado</p><p className="font-bold text-ink-900">{ctx.certDays}</p></div>
          </div>
          {!ctx.temCpf && <p className="sgo-aviso sgo-aviso--atencao">Este colaborador está sem CPF no cadastro. O pedido pode ser feito, mas o envio ao RH só sai depois de o cadastro ser sincronizado/corrigido — o Administrador é avisado.</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select label="Tipo do desligamento" placeholder="Selecione…" value={kind} onValueChange={(v) => { setKind(v as RhTerminationKind); if (v !== 'PEDIDO_DEMISSAO') { setLetterPath(''); setLetterName(''); } }} options={tipos} />
        <DatePicker label="Data do desligamento" value={terminationDate} onValueChange={(v) => setTerminationDate(v ?? '')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Motivo" placeholder="Selecione…" value={reasonCode} onValueChange={(v) => setReasonCode(v as RhTerminationReason)} options={motivos} />
        {semAviso
          ? <div className="self-end text-xs text-ink-500">Sem aviso prévio neste tipo (regra do RH).</div>
          : <Select label="Modalidade do aviso prévio" placeholder="Selecione…" value={mode} onValueChange={(v) => setMode(v as RhNoticeMode)} options={modalidades} />}
      </div>
      {pedidoDemissao && (
        <div>
          <Label>Carta de pedido de demissão (PDF, obrigatória)</Label>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => enviarCarta(e.target.files?.[0] ?? null)} className="block w-full text-sm" data-testid="carta-pdf" />
          {letterName && <p className="mt-1 text-xs text-success">Carta anexada: {letterName}</p>}
        </div>
      )}
      <div><Label>Idade (informe)</Label><Input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} placeholder="ex: 34" /></div>
      <div>
        <Label>{reasonCode === 'OUTRO' ? 'Justificativa (obrigatória)' : 'Observação (opcional)'}</Label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-lg border-2 border-line-strong bg-surface p-2 text-sm" placeholder={reasonCode === 'OUTRO' ? 'explique o motivo' : 'o que o RH precisa saber'} />
      </div>

      {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
      <p className="text-xs text-ink-500">O pedido fica <b>Aguardando aprovação</b> do supervisor. Aprovado, vai ao RH automaticamente e o andamento aparece na lista.</p>
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
      {rows.map((r) => {
        const envio = r.status === 'APPROVED' ? ENVIO[r.envio] : null;
        const aviso = r.avisoLabel ?? (r.noticeType ? NOTICE[r.noticeType] : null);
        return (
          <div key={r.id} className="p-3" data-testid={`desligamento-${r.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{r.collaboratorName}</p>
                <p className="text-xs text-ink-500">{r.unit}{r.tipoLabel ? ` · ${r.tipoLabel}` : ''}{aviso ? ` · ${aviso}` : ''}{r.by ? ` · ${r.by}` : ''}</p>
              </div>
              <StatusBadge tone={STw[r.status].tone}>{STw[r.status].label}</StatusBadge>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {r.terminationDate ? `Desligamento em ${dataBR(r.terminationDate)} · ` : ''}{r.motivoLabel ? `${r.motivoLabel} · ` : ''}{r.tenureText ?? 'tempo de empresa —'} · {r.certCount} atestado(s) / {r.certDays} dia(s){r.ageYears ? ` · ${r.ageYears} anos` : ''}{r.temCarta ? ' · carta anexada' : ''}
            </p>
            <p className="mt-1 text-sm">{r.reason}</p>
            {r.rejectionReason && <p className="mt-1 text-xs text-danger">Recusado: {r.rejectionReason}</p>}
            {r.status === 'APPROVED' && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="andamento-rh">
                <Send className="h-3.5 w-3.5 text-brand" />
                {envio && <StatusBadge tone={envio.tone}>{envio.label}</StatusBadge>}
                {r.envio === 'NAO_ENVIADO' && <span className="text-ink-500">Pedido anterior à integração — encaminhar ao RH manualmente.</span>}
                {r.envio === 'ENVIADO' && (
                  <span className="text-ink-700">
                    {r.rhProcesso ? <>Processo <b>{r.rhProcesso}</b> · </> : null}
                    Situação: <b>{r.situacaoRotulo ?? '—'}</b>
                    {r.rhPrazoLegal ? <> · prazo legal {dataBR(r.rhPrazoLegal)}</> : null}
                  </span>
                )}
              </div>
            )}
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
        );
      })}
    </Group>
  );
}
