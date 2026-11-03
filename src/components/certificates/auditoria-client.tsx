'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Download, Plus, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Textarea } from '@/components/ui/ds/field';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { SgoModal, SgoField } from '@/components/sgo/sgo-modal';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { shortUnitName } from '@/lib/unit-name';
import { ROTULO_SITUACAO, TOM_SITUACAO, MOTIVO_MIN, type SituacaoDaAuditoria } from '@/lib/certificates/auditoria-regras';
import type { AuditoriaDeAtestados, EsperadoDaAuditoria } from '@/lib/certificates/auditoria';

/**
 * Aba "Auditoria" da Central de Atestados (v1.181.0): o que DEVERIA ter sido
 * lançado × o que foi lançado. RH/supervisão informam o esperado; o gerente
 * justifica; a supervisão decide. Só a decisão é gravada — a situação é
 * derivada dos fatos (prazo em horas úteis a partir da ciência).
 */

type Unit = { id: string; name: string };
type Collab = { id: string; name: string };
const br = (iso: string) => iso.split('-').reverse().join('/');
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const pctBR = (n: number | null) => (n == null ? '—' : `${String(n).replace('.', ',')}%`);

function ultimosMeses(atual: string) {
  const [y, m] = atual.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const v = d.toISOString().slice(0, 7);
    return { value: v, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  });
}

export function AuditoriaAtestadosClient({ auditoria, ym, unitFiltro, units, collaboratorsByUnit, podeInformar, podeJustificar }: {
  auditoria: AuditoriaDeAtestados; ym: string; unitFiltro: string;
  units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>;
  /** Informar o esperado e decidir: supervisão/RH com "editar" na aba. */
  podeInformar: boolean;
  /** Justificar: gerente da unidade e a linha supervisora. */
  podeJustificar: boolean;
}) {
  const router = useRouter();
  const a = auditoria;
  const [informando, setInformando] = useState(false);
  const [justificando, setJustificando] = useState<EsperadoDaAuditoria | null>(null);
  const [revisando, setRevisando] = useState<EsperadoDaAuditoria | null>(null);
  const [filtroSituacao, setFiltroSituacao] = useState<'TODAS' | SituacaoDaAuditoria>('TODAS');
  const ir = (p: Record<string, string>) => router.push(`/modulos/atestados?${new URLSearchParams({ aba: 'auditoria', mes: ym, ...(unitFiltro ? { unit: unitFiltro } : {}), ...p }).toString()}`);
  const lista = useMemo(() => a.esperados.filter((e) => filtroSituacao === 'TODAS' || e.situacao === filtroSituacao), [a.esperados, filtroSituacao]);
  const r = a.rede;

  return (
    <div className="space-y-4" data-testid="auditoria-atestados">
      <div className="sgo-filtros -mx-4 print:hidden">
        <span className="sgo-label">Mês</span>
        <span className="w-48"><Select aria-label="Mês" className="capitalize" value={ym} onValueChange={(v) => ir({ mes: v })} options={ultimosMeses(ym)} /></span>
        {units.length > 1 && (
          <>
            <span className="sgo-label ml-2">Unidade</span>
            <span className="w-56"><Select aria-label="Unidade" value={unitFiltro || 'todas'} onValueChange={(v) => ir({ unit: v === 'todas' ? '' : v })} options={[{ value: 'todas', label: 'Todas' }, ...units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]} /></span>
          </>
        )}
        <span className="sgo-label ml-2">Situação</span>
        <span className="w-56"><Select aria-label="Situação" value={filtroSituacao} onValueChange={(v) => setFiltroSituacao(v as typeof filtroSituacao)} options={[{ value: 'TODAS', label: 'Todas' }, ...(Object.keys(ROTULO_SITUACAO) as SituacaoDaAuditoria[]).map((s) => ({ value: s, label: ROTULO_SITUACAO[s] }))]} /></span>
        <span className="ml-auto flex gap-1.5">
          <a className="sgo-btn sgo-btn--sm" href={`/api/certificates/auditoria/export?mes=${ym}${unitFiltro ? `&unit=${unitFiltro}` : ''}`}><Download className="h-4 w-4" /> Excel</a>
          {podeInformar && <button type="button" className="sgo-btn sgo-btn--sm sgo-btn--primary" onClick={() => setInformando(true)} data-testid="btn-informar"><Plus className="h-4 w-4" /> Informar atestado recebido</button>}
        </span>
      </div>

      <SgoKpis>
        <SgoKpi label="Atestados esperados" value={String(r.esperados)} meta={`${r.noPrazo} ainda no prazo · ${r.invalidos} inválido(s)`} icon={ClipboardCheck} tone="blue" testId="kpi-esperados" />
        <SgoKpi label="Conformes" value={String(r.conformes + r.justificados)} meta={`${r.conformes} no prazo · ${r.justificados} justificado(s)`} icon={ShieldCheck} tone="green" />
        <SgoKpi label="Em conferência" value={String(r.emConferencia)} meta="não prejudicam a nota até a supervisão decidir" icon={Users} tone={r.emConferencia ? 'amber' : 'gray'} testId="kpi-conferencia" />
        <SgoKpi label="Falhas confirmadas" value={String(r.falhas)} meta="prazo vencido, sem justificativa aprovada" tone={r.falhas ? 'red' : 'gray'} testId="kpi-falhas" />
        <SgoKpi label="Conformidade do mês" value={pctBR(r.pct)} meta={r.pct == null ? 'neutra — nada decidido no mês' : `faixa: perde ${r.penalizacao}% do peso → ${r.pontos} pontos de 100`} tone={r.pct == null ? 'gray' : r.pct >= 90 ? 'green' : r.pct >= 80 ? 'amber' : 'red'} testId="kpi-conformidade" />
      </SgoKpis>
      <p className="text-xs text-ink-500">
        Prazo de lançamento: <b>{a.prazoHoras} horas úteis</b> após a ciência do gerente (domingos e feriados cadastrados não contam). Conformidade = (conformes + justificados) ÷ (conformes + justificados + falhas confirmadas).
        Faixas sobre o peso do componente: 100% sem desconto · 90–99,9% perde {a.faixas[1]?.penalizacao}% · 80–89,9% perde {a.faixas[2]?.penalizacao}% · abaixo de 80% perde {a.faixas[3]?.penalizacao}%. A existência do atestado nunca pontua contra ninguém.
      </p>

      <Card>
        <PanelHeader title="Atestados esperados × lançados" count={lista.length} icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><ClipboardCheck className="h-4 w-4" /></span>} />
        <div className="overflow-x-auto p-2">
          {lista.length === 0 ? <p className="p-3 text-sm text-ink-500">Nenhum atestado esperado {filtroSituacao === 'TODAS' ? 'neste mês' : 'nesta situação'}. {podeInformar ? 'Use "Informar atestado recebido" quando o RH ou a unidade receber um atestado.' : ''}</p> : (
            <table className="sgo-tbl w-full text-sm" data-testid="tabela-esperados">
              <thead><tr><th className="text-left">Colaborador</th><th className="text-left">Unidade</th><th className="text-left">Período</th><th className="text-left">Ciência</th><th className="text-left">Prazo</th><th className="text-left">Lançamento</th><th className="text-left">Situação</th><th className="text-left">Responsáveis</th><th className="text-right">Ações</th></tr></thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id} data-testid="linha-esperado">
                    <td className="whitespace-nowrap font-medium text-ink-900">{e.collaboratorName}</td>
                    <td className="whitespace-nowrap">{shortUnitName(e.unitName)}</td>
                    <td className="whitespace-nowrap tabular-nums">{br(e.startDate)} – {br(e.endDate)}</td>
                    <td className="whitespace-nowrap tabular-nums">{hora(e.noticeAt)}</td>
                    <td className="whitespace-nowrap tabular-nums">{hora(e.prazoAte)}</td>
                    <td className="whitespace-normal text-xs">
                      {e.lancamento ? <>{hora(e.lancamento.lancadoEm)}{e.lancamento.atraso && <span className="sgo-tag sgo-tag--amber ml-1">depois do prazo</span>}<span className="block text-ink-500">por {e.lancamento.lancadoPor ?? '—'}</span></> : <span className="text-ink-500">não lançado</span>}
                    </td>
                    <td className="whitespace-normal">
                      <StatusBadge tone={TOM_SITUACAO[e.situacao]} dot>{ROTULO_SITUACAO[e.situacao]}</StatusBadge>
                      {e.justification && <span className="block text-xs text-ink-700">Justificativa ({e.justifiedByName}): {e.justification}</span>}
                      {e.reviewedByName && <span className="block text-xs text-ink-500">Supervisão: {e.reviewedByName} em {hora(e.reviewedAt)}{e.reviewNote ? ` — ${e.reviewNote}` : ''}</span>}
                    </td>
                    <td className="whitespace-normal text-xs">
                      <span className="block">Recebeu: {e.receivedByName ?? '—'}</span>
                      <span className="block">Informou: {e.informedByName}</span>
                      <span className="block">Deveria lançar: {e.responsibleName ? <b>{e.responsibleName}</b> : <span className="text-ink-500">{e.situacao === 'FALHA_CONFIRMADA' ? 'não atribuído' : 'só após validação'}</span>}</span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        {podeJustificar && (e.situacao === 'EM_CONFERENCIA' || e.situacao === 'FALHA_CONFIRMADA') && e.reviewStatus !== 'JUSTIFICADO' && (
                          <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => setJustificando(e)}>Justificar</button>
                        )}
                        {podeInformar && e.situacao !== 'CONFORME' && e.situacao !== 'NO_PRAZO' && (
                          <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => setRevisando(e)} data-testid="btn-revisar">Decidir</button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Conformidade por unidade" count={a.porUnidade.length} icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><ClipboardCheck className="h-4 w-4" /></span>} />
          <div className="overflow-x-auto p-2">
            {a.porUnidade.length === 0 ? <p className="p-3 text-sm text-ink-500">Sem esperados no mês.</p> : (
              <table className="sgo-tbl w-full text-sm" data-testid="tabela-por-unidade">
                <thead><tr><th className="text-left">Unidade</th><th className="text-right">Esperados</th><th className="text-right">Conformes</th><th className="text-right">Em conf.</th><th className="text-right">Falhas</th><th className="text-right">Conformidade</th><th className="text-right">Pontos</th></tr></thead>
                <tbody>
                  {a.porUnidade.map((u) => (
                    <tr key={u.unitId}>
                      <td className="whitespace-nowrap font-medium">{shortUnitName(u.unitName)}</td>
                      <td className="text-right tabular-nums">{u.esperados}</td>
                      <td className="text-right tabular-nums">{u.conformes + u.justificados}</td>
                      <td className="text-right tabular-nums">{u.emConferencia}</td>
                      <td className="text-right tabular-nums">{u.falhas ? <span className="font-semibold text-danger">{u.falhas}</span> : 0}</td>
                      <td className="text-right font-bold tabular-nums">{pctBR(u.pct)}</td>
                      <td className="text-right tabular-nums">{u.pontos == null ? <span className="text-ink-500">neutro</span> : `${u.pontos}/100`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="px-4 pb-3 text-xs text-ink-500">Resultado COLETIVO: é o que entra na meta da unidade (componente Atestados, quando ativo).</p>
        </Card>
        <Card>
          <PanelHeader title="Responsabilidade individual" count={a.porGerente.length} icon={<span className="sgo-panel__ic sgo-panel__ic--amber" aria-hidden><Users className="h-4 w-4" /></span>} />
          <div className="overflow-x-auto p-2">
            {a.porGerente.length === 0 ? <p className="p-3 text-sm text-ink-500">Nenhuma falha validada nem lançamento no mês.</p> : (
              <table className="sgo-tbl w-full text-sm" data-testid="tabela-por-gerente">
                <thead><tr><th className="text-left">Gerente / coordenador</th><th className="text-left">Unidade(s)</th><th className="text-right">Falhas validadas</th><th className="text-right">Lançou</th><th className="text-right">No prazo</th></tr></thead>
                <tbody>
                  {a.porGerente.map((g) => (
                    <tr key={g.userId}>
                      <td className="whitespace-nowrap font-medium">{g.name}</td>
                      <td className="whitespace-normal text-xs">{g.unidades.map(shortUnitName).join(', ')}</td>
                      <td className="text-right tabular-nums">{g.falhasConfirmadas ? <span className="font-semibold text-danger">{g.falhasConfirmadas}</span> : 0}</td>
                      <td className="text-right tabular-nums">{g.lancamentos}</td>
                      <td className="text-right tabular-nums">{g.lancamentosNoPrazo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="px-4 pb-3 text-xs text-ink-500">Só para análise gerencial: a falha só é atribuída a uma pessoa depois de validada pela supervisão; &quot;Lançou&quot; é quem de fato registrou o atestado. Nenhum desconto individual.</p>
        </Card>
      </div>

      {podeInformar && <InformarModal open={informando} onClose={() => setInformando(false)} units={units} collaboratorsByUnit={collaboratorsByUnit} unitPadrao={unitFiltro || units[0]?.id || ''} onSaved={() => { setInformando(false); router.refresh(); }} />}
      {justificando && <JustificarModal esperado={justificando} onClose={() => setJustificando(null)} onSaved={() => { setJustificando(null); router.refresh(); }} />}
      {revisando && <RevisarModal esperado={revisando} gerentes={a.gerentesPorUnidade[revisando.unitId] ?? []} onClose={() => setRevisando(null)} onSaved={() => { setRevisando(null); router.refresh(); }} />}
    </div>
  );
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/certificates/auditoria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Falha' };
  } catch { return { ok: false, error: 'Falha de conexão' }; }
}

function agoraLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function InformarModal({ open, onClose, units, collaboratorsByUnit, unitPadrao, onSaved }: { open: boolean; onClose: () => void; units: Unit[]; collaboratorsByUnit: Record<string, Collab[]>; unitPadrao: string; onSaved: () => void }) {
  const [unitId, setUnitId] = useState(unitPadrao);
  const [collaboratorId, setCollaboratorId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [noticeAt, setNoticeAt] = useState(agoraLocal());
  const [receivedByName, setReceivedByName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const collabs = collaboratorsByUnit[unitId] ?? [];
  const pronto = unitId && collaboratorId && startDate && endDate && noticeAt;
  async function salvar() {
    setBusy(true); setErro(null);
    const r = await post({ acao: 'informar', unitId, collaboratorId, startDate, endDate, noticeAt: new Date(noticeAt).toISOString(), receivedByName, note });
    setBusy(false);
    if (r.ok) onSaved(); else setErro(r.error ?? 'Falha');
  }
  return (
    <SgoModal open={open} onClose={() => (busy ? undefined : onClose())} title="Informar atestado recebido" subtitle="O que o gerente deveria lançar no SGO. O prazo conta a partir da ciência dele." tone="brand" size="md" data-testid="modal-informar"
      onSubmit={(e) => { e.preventDefault(); if (pronto && !busy) void salvar(); }}
      footer={<><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || !pronto}>{busy ? 'Gravando…' : 'Informar'}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SgoField label="Unidade" required><Select aria-label="Unidade do atestado" value={unitId} onValueChange={(v) => { setUnitId(v); setCollaboratorId(''); }} options={units.map((u) => ({ value: u.id, label: u.name }))} /></SgoField>
        <SgoField label="Colaborador" required><Select aria-label="Colaborador" searchable value={collaboratorId || null} onValueChange={setCollaboratorId} options={collabs.map((c) => ({ value: c.id, label: c.name }))} placeholder="Escolha…" /></SgoField>
        <DatePicker label="Início do afastamento" value={startDate || null} onValueChange={(v) => setStartDate(v ?? '')} />
        <DatePicker label="Fim do afastamento" min={startDate || undefined} value={endDate || null} onValueChange={(v) => setEndDate(v ?? '')} />
        <SgoField label="Ciência do gerente (data e hora)" required hint="Quando o gerente soube do atestado — o prazo de lançamento conta daqui.">
          <Input type="datetime-local" value={noticeAt} onChange={(e) => setNoticeAt(e.target.value)} aria-label="Ciência do gerente" />
        </SgoField>
        <SgoField label="Quem recebeu o atestado" hint="Nome de quem recebeu na unidade (opcional).">
          <Input value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} aria-label="Quem recebeu o atestado" />
        </SgoField>
        <SgoField label="Observação" span={2}><Input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Observação" /></SgoField>
      </div>
      {erro && <p className="mt-2 text-sm font-medium text-danger">{erro}</p>}
    </SgoModal>
  );
}

function JustificarModal({ esperado, onClose, onSaved }: { esperado: EsperadoDaAuditoria; onClose: () => void; onSaved: () => void }) {
  const [texto, setTexto] = useState(esperado.justification ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    setBusy(true); setErro(null);
    const r = await post({ acao: 'justificar', id: esperado.id, texto });
    setBusy(false);
    if (r.ok) onSaved(); else setErro(r.error ?? 'Falha');
  }
  return (
    <SgoModal open onClose={() => (busy ? undefined : onClose())} title={`Justificar — ${esperado.collaboratorName}`} subtitle="A justificativa só conta depois de aprovada pela supervisão." tone="amber" size="sm" data-testid="modal-justificar"
      onSubmit={(e) => { e.preventDefault(); if (texto.trim().length >= MOTIVO_MIN && !busy) void salvar(); }}
      footer={<><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || texto.trim().length < MOTIVO_MIN}>{busy ? 'Enviando…' : 'Enviar justificativa'}</Button></>}>
      <Label className="text-xs">Por que o lançamento atrasou ou não aconteceu? (mínimo {MOTIVO_MIN} caracteres)</Label>
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} aria-label="Justificativa" />
      {erro && <p className="mt-2 text-sm font-medium text-danger">{erro}</p>}
    </SgoModal>
  );
}

function RevisarModal({ esperado, gerentes, onClose, onSaved }: { esperado: EsperadoDaAuditoria; gerentes: Collab[]; onClose: () => void; onSaved: () => void }) {
  const [decisao, setDecisao] = useState<'FALHA' | 'JUSTIFICADO' | 'INVALIDO' | 'REABRIR'>(esperado.justification && esperado.reviewStatus !== 'JUSTIFICADO' ? 'JUSTIFICADO' : esperado.reviewStatus === 'AGUARDANDO' ? 'FALHA' : 'REABRIR');
  const [responsavel, setResponsavel] = useState(esperado.responsibleUserId ?? '');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const opcoes = [
    ...(esperado.reviewStatus === 'AGUARDANDO' || esperado.reviewStatus === 'JUSTIFICADO' ? [{ value: 'FALHA', label: 'Confirmar falha (prazo vencido, sem justificativa aprovada)' }] : []),
    ...(esperado.justification ? [{ value: 'JUSTIFICADO', label: 'Aprovar a justificativa (conta como conforme)' }] : []),
    { value: 'INVALIDO', label: 'Invalidar o esperado (não procedia)' },
    ...(esperado.reviewStatus !== 'AGUARDANDO' ? [{ value: 'REABRIR', label: 'Reabrir (volta para conferência)' }] : []),
  ];
  const pronto = decisao !== 'INVALIDO' || nota.trim().length >= MOTIVO_MIN;
  async function salvar() {
    setBusy(true); setErro(null);
    const r = await post({ acao: 'revisar', id: esperado.id, decisao, nota, responsibleUserId: decisao === 'FALHA' ? responsavel || null : null });
    setBusy(false);
    if (r.ok) onSaved(); else setErro(r.error ?? 'Falha');
  }
  return (
    <SgoModal open onClose={() => (busy ? undefined : onClose())} title={`Decidir — ${esperado.collaboratorName} (${br(esperado.startDate)} a ${br(esperado.endDate)})`} subtitle="Só a falha CONFIRMADA entra na conformidade; a responsabilidade individual nasce aqui." tone="brand" size="sm" data-testid="modal-revisar"
      onSubmit={(e) => { e.preventDefault(); if (pronto && !busy) void salvar(); }}
      footer={<><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || !pronto}>{busy ? 'Gravando…' : 'Confirmar decisão'}</Button></>}>
      <div className="space-y-3">
        {esperado.justification && <p className="rounded-lg border border-line bg-sunken p-2 text-sm"><b>Justificativa de {esperado.justifiedByName}:</b> {esperado.justification}</p>}
        <SgoField label="Decisão" required><Select aria-label="Decisão" value={decisao} onValueChange={(v) => setDecisao(v as typeof decisao)} options={opcoes} /></SgoField>
        {decisao === 'FALHA' && (
          <SgoField label="Quem deveria ter lançado (responsabilidade individual)" hint="Gerente ou coordenador da unidade. Pode ficar em branco: a falha conta para a unidade mesmo sem responsável.">
            <Select aria-label="Responsável" value={responsavel || null} onValueChange={setResponsavel} options={[{ value: '', label: 'Não atribuir' }, ...gerentes.map((g) => ({ value: g.id, label: g.name }))]} placeholder="Não atribuir" />
          </SgoField>
        )}
        <SgoField label={decisao === 'INVALIDO' ? 'Motivo (obrigatório)' : 'Nota da supervisão'} required={decisao === 'INVALIDO'}>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} aria-label="Nota da supervisão" />
        </SgoField>
        {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
      </div>
    </SgoModal>
  );
}
