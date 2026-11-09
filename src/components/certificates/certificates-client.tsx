'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LargeTitle } from '@/components/layout/page-chrome';
import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';

import { Plus, Sparkles, Trash2, FileText, Stethoscope, CalendarDays, TrendingUp, BarChart3, Printer, Camera, Images, AlertTriangle, CheckCircle2, ClipboardCheck, RotateCcw, History as HistoryIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { compressImage } from '@/lib/image-compress';
import { GRUPOS, SITUACOES, conferirNome, type GrupoDoDocumento } from '@/lib/certificates/catalogo';
import { podeCorrigir } from '@/lib/certificates/retorno-rh-regras';
import type { CertListItem, CertReport } from '@/lib/certificates/query';
import type { CertReadResult } from '@/lib/ai/atestado';
import type { CertificateType, DocumentStatus } from '@prisma/client';
import { Group } from '@/components/ui/ds/group';
import { AuditoriaAtestadosClient } from '@/components/certificates/auditoria-client';
import type { AuditoriaDeAtestados } from '@/lib/certificates/auditoria';

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

function daysBetween(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 1;
  const a = Date.parse(start + 'T00:00:00Z'), b = Date.parse(end + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return 1;
  return Math.floor((b - a) / 86_400_000) + 1;
}
function fmtDate(s: string | null): string { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
/** Horas entre "HH:MM" e "HH:MM" (vira a meia-noite), com uma casa; null se inválido. */
function horasDaJanela(ini: string | null | undefined, fim: string | null | undefined): number | null {
  if (!ini || !fim || !/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fim)) return null;
  const [h1, m1] = ini.split(':').map(Number); const [h2, m2] = fim.split(':').map(Number);
  let min = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (min <= 0) min += 24 * 60;
  return Math.round((min / 60) * 10) / 10;
}

const TOM: Record<(typeof SITUACOES)[DocumentStatus]['tom'], StatusTone> = { neutral: 'neutral', info: 'neutral', warning: 'medium', success: 'success', danger: 'critical' };
const TOM_DO_GRUPO: Record<GrupoDoDocumento, StatusTone> = { ATESTADO: 'success', AFASTAMENTO: 'black', COMPARECIMENTO: 'neutral', LICENCA: 'medium' };

type Aba = 'lancar' | 'historico' | 'painel' | 'auditoria';

export function CertificatesClient({ canLaunch, isAdmin, showCid, ym, units, collaboratorsByUnit, rows, report, abas = {}, subtitulo, auditoria, abaPedida, docPedido, unitFiltro = '' }: {
  /** Subtítulo do cabeçalho do kit (vem da página de servidor). */
  subtitulo?: React.ReactNode;
  canLaunch: boolean; isAdmin: boolean; showCid: boolean; ym: string;
  units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; rows: CertListItem[]; report: CertReport;
  /** Abas liberadas para o perfil (Configurações → Perfis de acesso). */
  abas?: AcessoAbas;
  /** v1.181.0 — a auditoria dos lançamentos (nula quando a aba está fechada para o perfil). */
  auditoria?: { dados: AuditoriaDeAtestados; podeInformar: boolean; podeJustificar: boolean } | null;
  /** Aba pedida na URL (?aba=auditoria|historico) — os links dos avisos caem direto nela. */
  abaPedida?: string;
  /** v1.197.0 — id do documento apontado pelo aviso (?doc=): o Histórico o destaca e rola até ele. */
  docPedido?: string;
  unitFiltro?: string;
}) {
  const router = useRouter();
  const preferida: Aba = abaPedida === 'auditoria' && auditoria ? 'auditoria' : abaPedida === 'historico' ? 'historico' : canLaunch ? 'lancar' : 'painel';
  const [tab, setTab] = useState<Aba>(abaInicial(abas, 'CERTIFICATES', preferida) as Aba);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Cabeçalho do kit (Fase 4): Lançar / Histórico / Painel como abas de ESTADO. */}
      <LargeTitle
        title="Central de Atestados e Afins"
        subtitle={subtitulo}
        tabs={[
          ...(canLaunch && podeAba(abas, 'lancar') ? [{ value: 'lancar' as const, label: 'Lançar', icon: <Plus className="h-3.5 w-3.5" /> }] : []),
          ...(podeAba(abas, 'historico') ? [{ value: 'historico' as const, label: 'Histórico', icon: <FileText className="h-3.5 w-3.5" /> }] : []),
          ...(podeAba(abas, 'painel') ? [{ value: 'painel' as const, label: 'Painel', icon: <BarChart3 className="h-3.5 w-3.5" /> }] : []),
          ...(auditoria && podeAba(abas, 'auditoria') ? [{ value: 'auditoria' as const, label: 'Auditoria', icon: <ClipboardCheck className="h-3.5 w-3.5" /> }] : []),
        ].map((o) => ({ label: o.label, icon: o.icon, active: tab === o.value, testId: `aba-${o.value}`, onClick: () => { setTab(o.value); if (o.value !== 'historico') setAviso(null); } }))}
      />

      {tab === 'lancar' && canLaunch && (
        <LaunchForm units={units} collaboratorsByUnit={collaboratorsByUnit} showCid={showCid} onSaved={(texto) => { setAviso(texto); setTab('historico'); router.refresh(); }} />
      )}
      {tab === 'historico' && (
        <>
          {aviso && (
            <div role="status" data-testid="aviso-enviado" className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-bg p-3 text-sm font-medium text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{aviso}</span>
            </div>
          )}
          <History rows={rows} isAdmin={isAdmin} showCid={showCid} canLaunch={canLaunch} collaboratorsByUnit={collaboratorsByUnit} docPedido={docPedido} onChanged={(texto) => { if (texto) setAviso(texto); router.refresh(); }} />
        </>
      )}
      {tab === 'painel' && <Panel report={report} ym={ym} />}
      {tab === 'auditoria' && auditoria && (
        <AuditoriaAtestadosClient auditoria={auditoria.dados} ym={ym} unitFiltro={unitFiltro} units={units} collaboratorsByUnit={collaboratorsByUnit} podeInformar={auditoria.podeInformar} podeJustificar={auditoria.podeJustificar} />
      )}
    </div>
  );
}

/* ───────────────────────── Lançar ─────────────────────────
 * Três passos (spec do Pedro, 09/11/2026): colaborador → foto/PDF → conferir e
 * enviar. O gerente NÃO escolhe tipo, grupo nem nomenclatura: a IA classifica
 * e o RH valida no sistema dele. O que a IA leu aparece para conferência;
 * corrigir um campo é permitido e fica registrado (campo + de/para) junto com
 * a leitura, para o RH saber o que veio do documento e o que foi editado. */
const MENSAGEM_ENVIADO = 'Documento enviado com sucesso. Aguardando análise do RH.';

function LaunchForm({ units, collaboratorsByUnit, showCid, onSaved }: {
  units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; showCid: boolean; onSaved: (texto: string) => void;
}) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [attachmentPath, setAttachmentPath] = useState('');
  const [ai, setAi] = useState<CertReadResult | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok' | 'info'; text: string } | null>(null);
  const [observation, setObservation] = useState('');

  // Campos conferíveis (pré-preenchidos pela IA; editáveis)
  const [issueDate, setIssueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorCrm, setDoctorCrm] = useState('');
  const [institution, setInstitution] = useState('');
  const [cid, setCid] = useState('');
  const [cidDescription, setCidDescription] = useState('');
  const [low, setLow] = useState<Set<string>>(new Set());
  const lidos = useRef<Record<string, string>>({});
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const collabs = collaboratorsByUnit[unitId] ?? [];
  const colaborador = collabs.find((c) => c.id === collaboratorId) ?? null;
  const tipo: CertificateType = ai?.fields?.type ?? 'FULL_DAY';
  const porHoras = tipo === 'HOURS';
  const days = useMemo(() => daysBetween(startDate, endDate), [startDate, endDate]);
  const ring = (k: string) => (low.has(k) ? 'ring-2 ring-warning' : '');
  const nome = useMemo(() => (colaborador && ai?.fields?.collaboratorName ? conferirNome(ai.fields.collaboratorName, colaborador.name) : null), [colaborador, ai]);

  function aplicarLeitura(r: CertReadResult) {
    const f = r.fields ?? {};
    const prox = {
      issueDate: f.issueDate ?? '', startDate: f.startDate ?? f.eventDate ?? '', endDate: f.endDate ?? f.startDate ?? f.eventDate ?? '',
      hours: f.hours != null ? String(f.hours) : (horasDaJanela(f.hoursStart, f.hoursEnd) != null ? String(horasDaJanela(f.hoursStart, f.hoursEnd)) : ''),
      doctorName: f.doctorName ?? '', doctorCrm: f.doctorCrm ?? '', institution: f.institution ?? '', cid: f.cid ?? '', cidDescription: f.cidDescription ?? '',
    };
    setIssueDate(prox.issueDate); setStartDate(prox.startDate); setEndDate(prox.endDate); setHours(prox.hours);
    setDoctorName(prox.doctorName); setDoctorCrm(prox.doctorCrm); setInstitution(prox.institution); setCid(prox.cid); setCidDescription(prox.cidDescription);
    lidos.current = prox;
    setLow(new Set(Array.isArray(r.lowConfidence) ? r.lowConfidence : []));
  }

  async function lerDocumento(file: File) {
    if (!unitId) { setMsg({ kind: 'err', text: 'Escolha a unidade primeiro.' }); return; }
    setReading(true); setMsg(null); setAi(null); setAttachmentPath('');
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
      const r = data.ai as CertReadResult | null;
      if (!r || !r.configured) { setAi({ configured: false, ok: false }); setMsg({ kind: 'info', text: 'Documento anexado. A leitura automática está indisponível — confira e preencha as datas antes de enviar.' }); return; }
      if (!r.ok) { setAi(r); setMsg({ kind: 'info', text: 'Documento anexado, mas a IA não conseguiu ler. Preencha as datas e envie; o RH classifica.' }); return; }
      setAi(r);
      aplicarLeitura(r);
      if (r.legivel === false) setMsg({ kind: 'err', text: 'A imagem ficou ilegível (cortada ou borrada). Tire outra foto, com o documento inteiro e bem iluminado.' });
      else setMsg({ kind: 'ok', text: 'Leitura concluída. Confira os dados abaixo (o que está em amarelo merece atenção) e envie.' });
    } finally { setReading(false); }
  }

  async function enviar() {
    if (!unitId || !collaboratorId) { setMsg({ kind: 'err', text: 'Escolha o colaborador.' }); return; }
    if (!attachmentPath) { setMsg({ kind: 'err', text: 'Anexe a foto ou o PDF do documento — é obrigatório.' }); return; }
    if (!startDate) { setMsg({ kind: 'err', text: porHoras ? 'Informe a data do atendimento.' : 'Informe o início do período.' }); return; }
    const fim = porHoras ? startDate : (endDate || startDate);
    setBusy(true); setMsg(null);
    try {
      const atuais: Record<string, string> = { issueDate, startDate, endDate: fim, hours, doctorName, doctorCrm, institution, cid, cidDescription };
      const editados: Record<string, { de: string; para: string }> = {};
      for (const k of Object.keys(lidos.current)) if ((lidos.current[k] ?? '') !== (atuais[k] ?? '')) editados[k] = { de: lidos.current[k] ?? '', para: atuais[k] ?? '' };
      const res = await fetch('/api/certificates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId, collaboratorId,
          nomenclatura: ai?.nomenclatura ?? undefined,
          type: ai?.nomenclatura ? undefined : tipo,
          issueDate: issueDate || undefined,
          startDate, endDate: fim,
          hours: porHoras && hours ? Number(hours) : undefined,
          doctorName: doctorName || undefined, doctorCrm: doctorCrm || undefined,
          cid: cid || undefined, cidDescription: cidDescription || undefined,
          observation: [institution ? `Emitido por: ${institution}` : '', observation].filter(Boolean).join(' · ') || undefined,
          attachmentPath,
          aiExtracted: ai ? { ...ai, editadoPeloGerente: Object.keys(editados).length ? editados : undefined } : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ kind: 'err', text: data.error ?? 'Falha ao enviar.' }); return; }
      onSaved(MENSAGEM_ENVIADO + (data.alerta === 'INSS' ? ' Mais de 15 dias: o RH recebeu o alerta de análise do INSS.' : ''));
    } finally { setBusy(false); }
  }

  const grupo = ai?.grupo ?? null;
  const podeEnviar = !!unitId && !!collaboratorId && !!attachmentPath && !!startDate && !busy && !reading;

  return (
    <div className="space-y-3" data-testid="lancar-documento">
      {/* Passo 1 — quem */}
      <section className="sgo-panel sgo-panel--solid p-3">
        <h2 className="mb-2 sgo-type-11 font-semibold text-ink-500">1 · Colaborador</h2>
        <div className={units.length > 1 ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : ''}>
          {units.length > 1 && (
            <Select label="Unidade" value={unitId} onValueChange={(v) => { setUnitId(v); setCollaboratorId(''); }} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
          )}
          <Select label="Colaborador" placeholder="Selecione…" searchable value={collaboratorId} onValueChange={setCollaboratorId} options={collabs.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
      </section>

      {/* Passo 2 — o documento */}
      <section className="sgo-panel sgo-panel--solid p-3">
        <h2 className="mb-2 flex items-center gap-1.5 sgo-type-11 font-semibold text-ink-500"><Sparkles className="h-4 w-4" /> 2 · Documento (a IA lê e classifica)</h2>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) lerDocumento(f); e.target.value = ''; }} />
        <input ref={galeriaRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) lerDocumento(f); e.target.value = ''; }} />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={reading} onClick={() => cameraRef.current?.click()} data-testid="tirar-foto"><Camera className="h-4 w-4" /> Tirar foto</Button>
          <Button type="button" variant="outline" disabled={reading} onClick={() => galeriaRef.current?.click()} data-testid="galeria-pdf"><Images className="h-4 w-4" /> Galeria ou PDF</Button>
        </div>
        {reading && <p className="mt-2 text-sm text-ink-900" role="status">Lendo o documento…</p>}
        {attachmentPath && !reading && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <a href={`/${attachmentPath}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand underline"><FileText className="h-3.5 w-3.5" /> Ver documento anexado</a>
            <button type="button" className="text-ink-500 underline" onClick={() => galeriaRef.current?.click()}>Trocar</button>
          </p>
        )}
        <p className="mt-2 text-[11px] text-ink-500">Foto ou PDF é obrigatório. Você não precisa dizer se é atestado, comparecimento ou licença: a IA identifica e o RH valida.</p>
      </section>

      {/* Passo 3 — conferir e enviar */}
      {attachmentPath && !reading && (
        <section className="sgo-panel sgo-panel--solid space-y-3 p-3" data-testid="conferencia">
          <h2 className="sgo-type-11 font-semibold text-ink-500">3 · Confira e envie</h2>

          {/* Classificação (só leitura: o RH ajusta) */}
          <div className="flex flex-wrap items-center gap-2" data-testid="classificacao">
            {ai?.nomenclatura && grupo ? (
              <>
                <StatusBadge tone={TOM_DO_GRUPO[grupo]}>{GRUPOS[grupo].rotulo}</StatusBadge>
                <span className="text-sm font-semibold text-ink-900">{ai.nomenclatura}</span>
              </>
            ) : (
              <>
                <StatusBadge tone="medium">Classificação pendente de análise do RH</StatusBadge>
                {ai?.naturezaLida && <span className="text-xs text-ink-500">A IA viu: “{ai.naturezaLida}”</span>}
              </>
            )}
          </div>

          {ai?.legivel === false && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 p-2 text-xs font-medium text-danger" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Documento ilegível para a IA. Se conseguir, tire outra foto; se enviar assim, o RH pode pedir correção.</p>
          )}
          {nome?.divergente && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-bg p-2 text-xs font-medium text-warning" role="alert" data-testid="nome-divergente"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> O documento parece ser de <b>{ai?.fields?.collaboratorName}</b>, e você escolheu <b>{colaborador?.name}</b>. Confira o colaborador antes de enviar.</p>
          )}
          {ai?.fields?.collaboratorName && !nome?.divergente && <p className="text-xs text-ink-500">Nome no documento: <b>{ai.fields.collaboratorName}</b> ✓</p>}

          {/* Período / horas */}
          {porHoras ? (
            <div className="grid grid-cols-2 gap-2">
              <DatePicker label="Data do atendimento" className={ring('startDate')} value={startDate || null} onValueChange={(v) => setStartDate(v ?? '')} />
              <div><Label>Horas</Label><Input inputMode="decimal" className={ring('hours')} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="ex: 2" />
                {ai?.fields?.hoursStart && ai?.fields?.hoursEnd && <p className="mt-1 text-[11px] text-ink-500">Janela lida: {ai.fields.hoursStart}–{ai.fields.hoursEnd}</p>}</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker label={grupo === 'LICENCA' ? 'Início da licença' : 'Início'} className={ring('startDate')} value={startDate || null} onValueChange={(v) => setStartDate(v ?? '')} />
                <DatePicker label="Fim" className={ring('endDate')} min={startDate || undefined} value={endDate || null} onValueChange={(v) => setEndDate(v ?? '')} />
              </div>
              {startDate && endDate && (
                <p className="text-xs font-semibold text-ink-900">{days} dia(s)
                  {ai?.fimSugeridoPelaRegra && <span className="font-normal text-ink-500"> — fim sugerido pela regra geral ({ai.nomenclatura}); o RH confirma o prazo.</span>}
                  {!ai?.fimSugeridoPelaRegra && ai?.fields?.returnDate && <span className="font-normal text-ink-500"> — retorno em {fmtDate(ai.fields.returnDate)}.</span>}
                </p>
              )}
            </>
          )}

          {/* Emissão / profissional / emissor — só o que o documento traz */}
          <div className="grid grid-cols-2 gap-2">
            <DatePicker label="Data de emissão" className={ring('issueDate')} value={issueDate || null} onValueChange={(v) => setIssueDate(v ?? '')} />
            <div><Label>Registro (CRM/CRO)</Label><Input className={ring('doctorCrm')} value={doctorCrm} onChange={(e) => setDoctorCrm(e.target.value)} placeholder="se houver" /></div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><Label>Profissional</Label><Input className={ring('doctorName')} value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="se houver" /></div>
            <div><Label>Emissor (clínica, hospital, órgão)</Label><Input className={ring('institution')} value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="se houver" /></div>
          </div>

          {showCid && (
            <div className="space-y-2 rounded-lg border border-danger/30 bg-danger/5 p-2">
              <p className="text-xs font-semibold text-danger">Dados sensíveis (LGPD) — visíveis só ao RH/Admin</p>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>CID</Label><Input className={ring('cid')} value={cid} onChange={(e) => setCid(e.target.value)} placeholder="só se estiver no documento" /></div>
                <div className="col-span-2"><Label>O que é (descrição)</Label><Input className={ring('cidDescription')} value={cidDescription} onChange={(e) => setCidDescription(e.target.value)} /></div>
              </div>
            </div>
          )}
          <div><Label>Observação (opcional)</Label><Input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="algo que o RH precise saber" /></div>
        </section>
      )}

      {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`text-sm font-medium ${msg.kind === 'err' ? 'text-danger' : msg.kind === 'ok' ? 'text-success' : 'text-ink-900'}`}>{msg.text}</p>}
      <Button className="w-full" disabled={!podeEnviar} onClick={enviar} data-testid="enviar-documento"><Plus className="h-4 w-4" /> Enviar documento</Button>
    </div>
  );
}

/* ───────────────────────── Histórico ───────────────────────── */
function History({ rows, isAdmin, showCid, canLaunch, collaboratorsByUnit, docPedido, onChanged }: { rows: CertListItem[]; isAdmin: boolean; showCid: boolean; canLaunch: boolean; collaboratorsByUnit: Record<string, Collab[]>; docPedido?: string; onChanged: (texto?: string) => void }) {
  const [busy, setBusy] = useState('');
  const [corrigindo, setCorrigindo] = useState<string | null>(docPedido && rows.some((r) => r.id === docPedido && podeCorrigir(r.status)) ? docPedido : null);
  useEffect(() => {
    if (!docPedido) return;
    const el = document.getElementById(`doc-${docPedido}`);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }, [docPedido]);
  async function remove(id: string) {
    if (!confirm('Excluir este documento? Reverte a marcação na Escala, avisa o RH (cancelamento) e fica na Auditoria. Não pode ser desfeito.')) return;
    setBusy(id);
    try {
      const res = await fetch('/api/admin/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'medicalCertificate', action: 'delete', id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? 'Falha'); return; }
      onChanged();
    } finally { setBusy(''); }
  }

  if (rows.length === 0) return <p className="text-sm text-ink-500">Nenhum documento registrado ainda.</p>;
  return (
    <Group>
      {rows.map((r) => {
        const sit = SITUACOES[r.status];
        const destaque = r.id === docPedido;
        return (
          <div key={r.id} id={`doc-${r.id}`} className={`scroll-mt-24 p-3 ${destaque ? 'ring-2 ring-brand ring-inset' : ''}`} data-testid="documento">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-[10rem] flex-1">
                <p className="break-words text-sm font-semibold text-ink-900">{r.collaboratorName}</p>
                <p className="text-xs text-ink-500">{r.unitName} · {r.by ?? '—'}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <StatusBadge tone={TOM_DO_GRUPO[r.grupo]}>{GRUPOS[r.grupo].rotulo}</StatusBadge>
                <StatusBadge tone={TOM[sit.tom]}>{sit.rotulo}</StatusBadge>
              </div>
            </div>
            <p className="mt-1 text-sm font-medium text-ink-900">{r.rotulo}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span><b>{r.type === 'HOURS' ? `${r.hours ?? '—'} h` : `${r.days} dia(s)`}</b></span>
              <span className="text-ink-500">{fmtDate(r.startDate)}{r.type !== 'HOURS' ? ` → ${fmtDate(r.endDate)}` : ''}</span>
              {r.doctorCrm && <span className="text-ink-500">{r.doctorCrm}</span>}
              {showCid && r.cid && <span className="text-ink-500">CID {r.cid}{r.cidDescription ? ` — ${r.cidDescription}` : ''}</span>}
              {r.attachmentPath && <a href={`/${r.attachmentPath}`} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">Ver documento</a>}
            </div>
            {(r.alerta === 'INSS' || r.nomeDivergente || r.statusNote || r.statusMotivoLabel) && (
              <div className="mt-2 space-y-1 text-xs">
                {r.alerta === 'INSS' && <p className="flex items-center gap-1 font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Mais de 15 dias — análise do INSS a cargo do RH.</p>}
                {r.nomeDivergente && <p className="flex items-center gap-1 font-medium text-warning"><AlertTriangle className="h-3.5 w-3.5" /> O nome lido no documento não bate com o colaborador — conferir.</p>}
                {(r.statusNote || r.statusMotivoLabel) && (
                  <p className={`rounded-md border p-2 ${r.status === 'CORRECAO_SOLICITADA' || r.status === 'NAO_ACEITO' ? 'border-danger/40 bg-danger/5 text-ink-900' : 'text-ink-900'}`} data-testid="retorno-rh">
                    <b>RH:</b> {r.statusMotivoLabel ? <>{r.statusMotivoLabel}{r.statusNote ? ' — ' : ''}</> : null}{r.statusNote}
                  </p>
                )}
              </div>
            )}
            {canLaunch && podeCorrigir(r.status) && corrigindo !== r.id && (
              <div className="mt-2">
                <Button size="sm" onClick={() => setCorrigindo(r.id)} data-testid="corrigir-reenviar"><RotateCcw className="h-4 w-4" /> Corrigir e reenviar</Button>
              </div>
            )}
            {corrigindo === r.id && (
              <CorrecaoPanel row={r} collabs={collaboratorsByUnit[r.unitId] ?? []} onCancel={() => setCorrigindo(null)} onDone={(texto) => { setCorrigindo(null); onChanged(texto); }} />
            )}
            {r.eventos.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="flex cursor-pointer items-center gap-1 font-semibold text-ink-500"><HistoryIcon className="h-3.5 w-3.5" /> Histórico do documento ({r.eventos.length})</summary>
                <ul className="mt-1 space-y-1 border-l-2 border-line pl-3">
                  {r.eventos.map((e, i) => (
                    <li key={i} className="text-ink-900">
                      <span className="text-ink-500">{new Date(e.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      {' · '}
                      {e.kind === 'SITUACAO' && <>RH: <b>{e.toStatus ? SITUACOES[e.toStatus].rotulo : '—'}</b>{e.motivo ? ` (${e.motivo.replace(/_/g, ' ')})` : ''}{e.note ? ` — ${e.note}` : ''}</>}
                      {e.kind === 'CORRECAO' && <>Corrigido por {e.actorName ?? 'gerente'}{e.note ? `: ${e.note}` : ''}</>}
                      {e.kind === 'ANEXO' && <>Versão anterior do arquivo{e.attachmentPath ? <> — <a href={`/${e.attachmentPath}`} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">ver</a></> : null}</>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {isAdmin && (
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="ghost" className="text-danger" disabled={busy === r.id} onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /> Excluir</Button>
              </div>
            )}
          </div>
        );
      })}
    </Group>
  );
}

/* ───────────────────────── Correção (RH pediu) ─────────────────────────
 * O gerente corrige NO MESMO registro: troca o arquivo (sobe por /api/certificates/read,
 * que também o relê por IA), ajusta datas ou colaborador e reenvia. A versão anterior
 * do arquivo fica guardada; o RH recebe um "atualizar" com o mesmo sgoMovimentoId. */
function CorrecaoPanel({ row, collabs, onCancel, onDone }: { row: CertListItem; collabs: Collab[]; onCancel: () => void; onDone: (texto: string) => void }) {
  const [attachmentPath, setAttachmentPath] = useState('');
  const [ai, setAi] = useState<CertReadResult | null>(null);
  const [startDate, setStartDate] = useState(row.startDate);
  const [endDate, setEndDate] = useState(row.endDate);
  const [collaboratorId, setCollaboratorId] = useState(row.collaboratorId);
  const [observation, setObservation] = useState(row.observation ?? '');
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const porHoras = row.type === 'HOURS';

  async function trocarArquivo(file: File) {
    setReading(true); setMsg(null);
    try {
      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      const toSend = isImage ? await compressImage(file).catch(() => file) : file;
      const fd = new FormData(); fd.append('unitId', row.unitId); fd.append('file', toSend);
      const res = await fetch('/api/certificates/read', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha ao enviar o arquivo.'); return; }
      setAttachmentPath(data.attachmentPath ?? '');
      const r = data.ai as CertReadResult | null;
      setAi(r && r.configured && r.ok ? r : null);
      if (r && r.configured && r.ok && r.fields?.startDate) { setStartDate(r.fields.startDate); if (r.fields.endDate) setEndDate(r.fields.endDate); }
      if (r?.legivel === false) setMsg('A nova imagem também ficou ilegível — tente outra foto.');
    } finally { setReading(false); }
  }

  async function reenviar() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/certificates/${row.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'corrigir', attachmentPath: attachmentPath || undefined, startDate, endDate: porHoras ? startDate : endDate, collaboratorId, observation, aiExtracted: ai ?? undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha ao reenviar.'); return; }
      onDone(data.reenvio === 'ENFILEIRADO' ? 'Documento corrigido e reenviado ao RH.'
        : data.reenvio === 'ERRO_DE_DADOS' ? 'Documento corrigido, mas o reenvio ao RH ficou com erro de dados (ex.: colaborador sem CPF) — o Administrador revisa em Envios ao RH.'
        : 'Documento corrigido. O envio ao RH ainda não tinha saído e levará a versão corrigida.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-brand/30 bg-brand-tint/40 p-3" data-testid="painel-correcao">
      <p className="text-xs font-semibold text-ink-900">Corrigir e reenviar ao RH</p>
      {(row.statusMotivoLabel || row.statusNote) && <p className="text-xs text-ink-900"><b>O RH pediu:</b> {row.statusMotivoLabel}{row.statusNote ? ` — ${row.statusNote}` : ''}</p>}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarArquivo(f); e.target.value = ''; }} />
      <input ref={galeriaRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) trocarArquivo(f); e.target.value = ''; }} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" variant="outline" disabled={reading} onClick={() => cameraRef.current?.click()}><Camera className="h-4 w-4" /> Nova foto</Button>
        <Button type="button" size="sm" variant="outline" disabled={reading} onClick={() => galeriaRef.current?.click()}><Images className="h-4 w-4" /> Galeria ou PDF</Button>
      </div>
      {reading && <p className="text-xs text-ink-900" role="status">Lendo o documento…</p>}
      {attachmentPath && !reading && <p className="text-xs"><a href={`/${attachmentPath}`} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">Ver novo arquivo</a> <span className="text-ink-500">(o anterior fica guardado como versão)</span></p>}
      <Select label="Colaborador" size="sm" searchable value={collaboratorId} onValueChange={setCollaboratorId} options={collabs.map((c) => ({ value: c.id, label: c.name }))} />
      {porHoras ? (
        <DatePicker label="Data do atendimento" size="sm" value={startDate || null} onValueChange={(v) => setStartDate(v ?? '')} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <DatePicker label="Início" size="sm" value={startDate || null} onValueChange={(v) => setStartDate(v ?? '')} />
          <DatePicker label="Fim" size="sm" min={startDate || undefined} value={endDate || null} onValueChange={(v) => setEndDate(v ?? '')} />
        </div>
      )}
      <div><Label className="text-xs">Observação ao RH</Label><Input className="h-10 text-sm" value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="opcional" /></div>
      {msg && <p className="text-xs font-medium text-danger" role="alert">{msg}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || reading} onClick={reenviar} data-testid="reenviar-rh"><RotateCcw className="h-4 w-4" /> Reenviar ao RH</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
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
            <Select aria-label="Mês" className="capitalize" value={ym} onValueChange={(v) => router.push(`/modulos/atestados?mes=${v}`)} options={ultimosMeses(ym)} />
          </div>
        </div>
        <a href={`/modulos/atestados/relatorio?mes=${ym}`} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold text-brand"><Printer className="h-4 w-4" /> Relatório (PDF)</a>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard icon={<Stethoscope className="h-5 w-5" />} label="Documentos no mês" value={String(report.totals.count)} />
        <KpiCard icon={<CalendarDays className="h-5 w-5" />} label="Dias perdidos" value={String(report.totals.days)} />
      </div>

      {/* Situação dos lançamentos (o gerente acompanha o que importa: enviados, em análise, correções, concluídos) */}
      <div className="rounded-lg border bg-surface p-3" data-testid="por-situacao">
        <h3 className="mb-2 text-sm font-bold text-ink-900">Situação dos lançamentos</h3>
        {report.byStatus.length === 0 ? <p className="text-sm text-ink-500">—</p> : (
          <div className="flex flex-wrap gap-2">
            {report.byStatus.map((s) => <StatusBadge key={s.status} tone={TOM[SITUACOES[s.status].tom]}>{SITUACOES[s.status].rotulo} · {s.count}</StatusBadge>)}
          </div>
        )}
      </div>

      {/* Ranking por unidade */}
      <div className="rounded-lg border bg-surface p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-900"><TrendingUp className="h-4 w-4" /> Por unidade (mais dias perdidos)</h3>
        {report.byUnit.length === 0 ? <p className="text-sm text-ink-500">Sem documentos neste mês.</p> : (
          <div className="space-y-1.5">
            {report.byUnit.map((u) => (
              <div key={u.unitId} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{u.unitName}</span>
                  <span className="shrink-0 text-ink-500">{u.days} dia(s) · {u.count} doc. · <b className={u.absenteeismPct >= 5 ? 'text-danger' : 'text-brand'}>{u.absenteeismPct}%</b></span>
                </div>
                <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (u.days / Math.max(1, report.byUnit[0].days)) * 100)}%` }} /></div>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-ink-500">% = taxa de absenteísmo (dias de afastamento ÷ colaboradores × dias do mês).</p>
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

      {/* Por dia da semana + por grupo/nomenclatura */}
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
        <div className="rounded-lg border bg-surface p-3" data-testid="por-grupo">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Por grupo e tipo de documento</h3>
          {report.byGroup.length === 0 ? <p className="text-sm text-ink-500">—</p> : (
            <ul className="space-y-2 text-sm">
              {report.byGroup.map((g) => (
                <li key={g.grupo}>
                  <div className="flex justify-between font-semibold"><span>{GRUPOS[g.grupo].plural}</span><span className="text-ink-500">{g.count} · {g.days} dia(s)</span></div>
                  <ul className="mt-0.5 space-y-0.5 pl-3 text-xs">
                    {report.byNomenclature.filter((n) => n.grupo === g.grupo).map((n) => <li key={n.rotulo} className="flex justify-between"><span className="text-ink-900">{n.rotulo}</span><span className="text-ink-500">{n.count} · {n.days} dia(s)</span></li>)}
                  </ul>
                </li>
              ))}
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
      <div className="flex items-center gap-2 text-ink-500">{icon}<span className="sgo-type-11 font-semibold">{label}</span></div>
      <p className="sgo-type-24 mt-1 font-semibold text-ink-900">{value}</p>
    </div>
  );
}

