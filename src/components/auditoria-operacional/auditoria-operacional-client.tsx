'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Download, Link2, Plus, ShieldCheck, Stethoscope, Users } from 'lucide-react';
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
import { ROTULO_SITUACAO, TOM_SITUACAO, MOTIVO_MIN, ROTULO_ORIGEM, ORIGENS, REFERENCIA_MIN, moduloAuditado, type SituacaoDaAuditoria } from '@/lib/auditoria-operacional/regras';
import type { AuditoriaOperacional, OcorrenciaDaAuditoria } from '@/lib/auditoria-operacional/auditoria';

/**
 * AUDITORIA OPERACIONAL (v1.184.0): o que DEVERIA ter sido lançado × o que
 * foi lançado, em Notas, Gás, Óleo e Pagamentos. A supervisão informa a
 * ocorrência; o gerente justifica; a supervisão decide. Só a decisão é
 * gravada — a situação é derivada dos fatos (prazo em horas úteis a partir
 * da ciência). Os atestados seguem na Central própria: aqui só o resumo.
 */

type Unit = { id: string; name: string };
type Pessoa = { id: string; name: string };
export interface ResumoDeAtestados { esperados: number; conformes: number; justificados: number; falhas: number; emConferencia: number; pct: number | null; pontos: number | null }

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

export function AuditoriaOperacionalClient({ auditoria, ym, unitFiltro, units, podeInformar, podeJustificar, atestados, linkAtestados }: {
  auditoria: AuditoriaOperacional; ym: string; unitFiltro: string; units: Unit[];
  /** Informar, vincular e decidir: supervisão/coordenação com "editar" no módulo. */
  podeInformar: boolean;
  /** Justificar: gerente da unidade e a linha supervisora. */
  podeJustificar: boolean;
  /** Resumo da Auditoria de Atestados (a auditoria completa fica na Central de Atestados). */
  atestados: ResumoDeAtestados | null;
  linkAtestados: string | null;
}) {
  const router = useRouter();
  const a = auditoria;
  const cat = moduloAuditado(a.modulo)!;
  const [informando, setInformando] = useState(false);
  const [vinculando, setVinculando] = useState<OcorrenciaDaAuditoria | null>(null);
  const [justificando, setJustificando] = useState<OcorrenciaDaAuditoria | null>(null);
  const [revisando, setRevisando] = useState<OcorrenciaDaAuditoria | null>(null);
  const [filtroSituacao, setFiltroSituacao] = useState<'TODAS' | SituacaoDaAuditoria>('TODAS');
  const ir = (p: Record<string, string>) => router.push(`/modulos/auditoria-operacional?${new URLSearchParams({ modulo: a.modulo.toLowerCase(), mes: ym, ...(unitFiltro ? { unit: unitFiltro } : {}), ...p }).toString()}`);
  const lista = useMemo(() => a.ocorrencias.filter((e) => filtroSituacao === 'TODAS' || e.situacao === filtroSituacao), [a.ocorrencias, filtroSituacao]);
  const r = a.rede;
  const refresh = () => router.refresh();

  return (
    <div className="space-y-4" data-testid="auditoria-operacional">
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
          <a className="sgo-btn sgo-btn--sm" href={`/api/auditoria-operacional/export?mes=${ym}&modulo=${a.modulo.toLowerCase()}${unitFiltro ? `&unit=${unitFiltro}` : ''}`}><Download className="h-4 w-4" /> Excel</a>
          {podeInformar && <button type="button" className="sgo-btn sgo-btn--sm sgo-btn--primary" onClick={() => setInformando(true)} data-testid="btn-informar"><Plus className="h-4 w-4" /> Informar ocorrência</button>}
        </span>
      </div>

      <SgoKpis>
        <SgoKpi label={`${cat.rotulo} — esperadas`} value={String(r.esperados)} meta={`${r.noPrazo} ainda no prazo · ${r.invalidos} inválida(s)`} icon={ClipboardCheck} tone="blue" testId="kpi-esperados" />
        <SgoKpi label="Conformes" value={String(r.conformes + r.justificados)} meta={`${r.conformes} no prazo · ${r.justificados} justificada(s)`} icon={ShieldCheck} tone="green" />
        <SgoKpi label="Em conferência" value={String(r.emConferencia)} meta="não prejudicam a nota até a supervisão decidir" icon={Users} tone={r.emConferencia ? 'amber' : 'gray'} testId="kpi-conferencia" />
        <SgoKpi label="Falhas confirmadas" value={String(r.falhas)} meta="prazo vencido, sem justificativa aprovada" tone={r.falhas ? 'red' : 'gray'} testId="kpi-falhas" />
        <SgoKpi label="Conformidade do mês" value={pctBR(r.pct)} meta={r.pct == null ? 'neutra — nada decidido no mês' : `desconto ${r.penalizacao}% do peso → ${r.pontos} pontos de 100`} tone={r.pct == null ? 'gray' : r.pct >= 90 ? 'green' : r.pct >= 80 ? 'amber' : 'red'} testId="kpi-conformidade" />
      </SgoKpis>
      <p className="text-xs text-ink-500">
        Prazo de lançamento de {cat.rotulo.toLowerCase()}: <b>{a.prazoHoras} horas úteis</b> após a ciência do gerente (domingos e feriados cadastrados não contam). Cada falha confirmada desconta <b>{a.pctPorFalha}%</b> do peso do componente, acumulando até 100%.
        Conformidade = (conformes + justificadas) ÷ (conformes + justificadas + falhas confirmadas). Lançamento auditado aqui sai do desconto &quot;Fora do prazo&quot; — nunca conta duas vezes. Mês sem ocorrência decidida = neutro.
      </p>

      <Card>
        <PanelHeader title={`${cat.rotulo}: ocorrências esperadas × lançadas`} count={lista.length} icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><ClipboardCheck className="h-4 w-4" /></span>} />
        <div className="overflow-x-auto p-2">
          {lista.length === 0 ? <p className="p-3 text-sm text-ink-500">Nenhuma ocorrência esperada {filtroSituacao === 'TODAS' ? 'neste mês' : 'nesta situação'}. {podeInformar ? 'Use "Informar ocorrência" quando souber de algo que o gerente deveria ter lançado.' : ''}</p> : (
            <table className="sgo-tbl w-full text-sm" data-testid="tabela-ocorrencias">
              <thead><tr><th className="text-left">Referência</th><th className="text-left">Unidade</th><th className="text-left">Fato</th><th className="text-left">Ciência</th><th className="text-left">Prazo</th><th className="text-left">Lançamento</th><th className="text-left">Situação</th><th className="text-left">Origem / responsáveis</th><th className="text-right">Ações</th></tr></thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id} data-testid="linha-ocorrencia">
                    <td className="whitespace-normal font-medium text-ink-900">{e.reference}{e.note && <span className="block text-xs font-normal text-ink-500">{e.note}</span>}</td>
                    <td className="whitespace-nowrap">{shortUnitName(e.unitName)}</td>
                    <td className="whitespace-nowrap tabular-nums">{br(e.eventDate)}</td>
                    <td className="whitespace-nowrap tabular-nums">{hora(e.noticeAt)}</td>
                    <td className="whitespace-nowrap tabular-nums">{hora(e.prazoAte)}</td>
                    <td className="whitespace-normal text-xs">
                      {e.lancamento ? <>{hora(e.lancamento.lancadoEm)}{e.lancamento.atraso && <span className="sgo-tag sgo-tag--amber ml-1">depois do prazo</span>}<span className="block text-ink-500">por {e.lancamento.lancadoPor ?? '—'}{e.lancamento.descricao ? ` · ${e.lancamento.descricao}` : ''}</span></> : <span className="text-ink-500">não lançado{e.candidatos.length > 0 ? ` · ${e.candidatos.length} lançamento(s) na janela` : ''}</span>}
                    </td>
                    <td className="whitespace-normal">
                      <StatusBadge tone={TOM_SITUACAO[e.situacao]} dot>{ROTULO_SITUACAO[e.situacao]}</StatusBadge>
                      {e.justification && <span className="block text-xs text-ink-700">Justificativa ({e.justifiedByName}): {e.justification}</span>}
                      {e.reviewedByName && <span className="block text-xs text-ink-500">Supervisão: {e.reviewedByName} em {hora(e.reviewedAt)}{e.reviewNote ? ` — ${e.reviewNote}` : ''}</span>}
                    </td>
                    <td className="whitespace-normal text-xs">
                      <span className="block">Origem: {ROTULO_ORIGEM[e.source]}{e.sourceDetail ? ` — ${e.sourceDetail}` : ''}</span>
                      <span className="block">Informou: {e.informedByName}</span>
                      <span className="block">Previsto: {e.expectedUserName ?? '—'}</span>
                      <span className="block">Deveria lançar: {e.responsibleName ? <b>{e.responsibleName}</b> : <span className="text-ink-500">{e.situacao === 'FALHA_CONFIRMADA' ? 'não atribuído' : 'só após validação'}</span>}</span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <span className="inline-flex gap-1">
                        {podeInformar && e.situacao !== 'INVALIDO' && (
                          <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => setVinculando(e)} data-testid="btn-vincular"><Link2 className="h-3.5 w-3.5" /> {e.lancamento ? 'Vínculo' : 'Vincular'}</button>
                        )}
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
            {a.porUnidade.length === 0 ? <p className="p-3 text-sm text-ink-500">Sem ocorrências no mês.</p> : (
              <table className="sgo-tbl w-full text-sm" data-testid="tabela-por-unidade">
                <thead><tr><th className="text-left">Unidade</th><th className="text-right">Esperadas</th><th className="text-right">Conformes</th><th className="text-right">Em conf.</th><th className="text-right">Falhas</th><th className="text-right">Conformidade</th><th className="text-right">Pontos</th></tr></thead>
                <tbody>
                  {a.porUnidade.map((u) => (
                    <tr key={u.unitId}>
                      <td className="whitespace-nowrap font-medium">{shortUnitName(u.unitName)}</td>
                      <td className="text-right tabular-nums">{u.esperados}</td>
                      <td className="text-right tabular-nums">{u.conformes + u.justificados}</td>
                      <td className="text-right tabular-nums">{u.emConferencia}</td>
                      <td className="text-right tabular-nums">{u.falhas ? <span className="font-semibold text-danger">{u.falhas}</span> : 0}</td>
                      <td className="text-right font-bold tabular-nums">{pctBR(u.pct)}</td>
                      <td className="text-right tabular-nums">{u.pontos == null ? <span className="text-ink-500">neutro</span> : `${String(u.pontos).replace('.', ',')}/100`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="px-4 pb-3 text-xs text-ink-500">Resultado COLETIVO: é o que entra na meta da unidade (componente &quot;{cat.rotulo} (auditoria de lançamento)&quot;, quando ativo).</p>
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
          <p className="px-4 pb-3 text-xs text-ink-500">Só para análise: a falha só é atribuída a uma pessoa depois de validada pela supervisão; &quot;Lançou&quot; é quem de fato registrou. Nenhum desconto individual.</p>
        </Card>
      </div>

      <Card>
        <PanelHeader title="Os quatro módulos no mês" icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><ClipboardCheck className="h-4 w-4" /></span>} />
        <div className="overflow-x-auto p-2">
          <table className="sgo-tbl w-full text-sm" data-testid="tabela-modulos">
            <thead><tr><th className="text-left">Módulo</th><th className="text-right">Esperadas</th><th className="text-right">Conformes</th><th className="text-right">Em conf.</th><th className="text-right">Falhas</th><th className="text-right">Conformidade</th><th className="text-right">Prazo</th><th className="text-right">% por falha</th><th className="text-right">Pontos</th></tr></thead>
            <tbody>
              {a.modulos.map((m) => (
                <tr key={m.modulo} className={m.modulo === a.modulo ? 'bg-brand-tint/60' : undefined}>
                  <td className="whitespace-nowrap font-medium"><button type="button" className="text-brand underline-offset-2 hover:underline" onClick={() => ir({ modulo: m.modulo.toLowerCase() })}>{m.rotulo}</button></td>
                  <td className="text-right tabular-nums">{m.esperados}</td>
                  <td className="text-right tabular-nums">{m.conformes + m.justificados}</td>
                  <td className="text-right tabular-nums">{m.emConferencia}</td>
                  <td className="text-right tabular-nums">{m.falhas ? <span className="font-semibold text-danger">{m.falhas}</span> : 0}</td>
                  <td className="text-right font-bold tabular-nums">{pctBR(m.pct)}</td>
                  <td className="text-right tabular-nums">{m.prazoHoras} h</td>
                  <td className="text-right tabular-nums">{m.pctPorFalha}%</td>
                  <td className="text-right tabular-nums">{m.pontos == null ? <span className="text-ink-500">neutro</span> : `${String(m.pontos).replace('.', ',')}/100`}</td>
                </tr>
              ))}
              {atestados && (
                <tr data-testid="linha-atestados">
                  <td className="whitespace-nowrap font-medium">{linkAtestados ? <Link href={linkAtestados} className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline"><Stethoscope className="h-3.5 w-3.5" /> Atestados (Central de Atestados)</Link> : <span className="inline-flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" /> Atestados</span>}</td>
                  <td className="text-right tabular-nums">{atestados.esperados}</td>
                  <td className="text-right tabular-nums">{atestados.conformes + atestados.justificados}</td>
                  <td className="text-right tabular-nums">{atestados.emConferencia}</td>
                  <td className="text-right tabular-nums">{atestados.falhas ? <span className="font-semibold text-danger">{atestados.falhas}</span> : 0}</td>
                  <td className="text-right font-bold tabular-nums">{pctBR(atestados.pct)}</td>
                  <td className="text-right text-xs text-ink-500" colSpan={2}>auditoria completa na Central</td>
                  <td className="text-right tabular-nums">{atestados.pontos == null ? <span className="text-ink-500">neutro</span> : `${atestados.pontos}/100`}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-3 text-xs text-ink-500">Pesos, status (Monitoramento/Ativo), prazos e % por falha: Metas → Configuração da Meta. Os atestados têm a própria régua (faixas de conformidade) e a auditoria completa fica na Central de Atestados.</p>
      </Card>

      {podeInformar && <InformarModal open={informando} modulo={a.modulo} onClose={() => setInformando(false)} units={units} gerentesPorUnidade={a.gerentesPorUnidade} unitPadrao={unitFiltro || units[0]?.id || ''} onSaved={() => { setInformando(false); refresh(); }} />}
      {vinculando && <VincularModal ocorrencia={vinculando} onClose={() => setVinculando(null)} onSaved={() => { setVinculando(null); refresh(); }} />}
      {justificando && <JustificarModal ocorrencia={justificando} onClose={() => setJustificando(null)} onSaved={() => { setJustificando(null); refresh(); }} />}
      {revisando && <RevisarModal ocorrencia={revisando} gerentes={a.gerentesPorUnidade[revisando.unitId] ?? []} onClose={() => setRevisando(null)} onSaved={() => { setRevisando(null); refresh(); }} />}
    </div>
  );
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auditoria-operacional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? 'Falha' };
  } catch { return { ok: false, error: 'Falha de conexão' }; }
}

function agoraLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function InformarModal({ open, modulo, onClose, units, gerentesPorUnidade, unitPadrao, onSaved }: { open: boolean; modulo: string; onClose: () => void; units: Unit[]; gerentesPorUnidade: Record<string, Pessoa[]>; unitPadrao: string; onSaved: () => void }) {
  const cat = moduloAuditado(modulo)!;
  const [unitId, setUnitId] = useState(unitPadrao);
  const [reference, setReference] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [noticeAt, setNoticeAt] = useState(agoraLocal());
  const [source, setSource] = useState('SUPERVISION');
  const [sourceDetail, setSourceDetail] = useState('');
  const [expectedUserId, setExpectedUserId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const gerentes = gerentesPorUnidade[unitId] ?? [];
  const pronto = unitId && reference.trim().length >= REFERENCIA_MIN && eventDate && noticeAt;
  async function salvar() {
    setBusy(true); setErro(null);
    const r = await post({ acao: 'informar', modulo, unitId, reference, eventDate, noticeAt: new Date(noticeAt).toISOString(), source, sourceDetail, expectedUserId: expectedUserId || null, note });
    setBusy(false);
    if (r.ok) onSaved(); else setErro(r.error ?? 'Falha');
  }
  return (
    <SgoModal open={open} onClose={() => (busy ? undefined : onClose())} title={`Informar ocorrência — ${cat.rotulo}`} subtitle="O que o gerente deveria lançar no SGO. O prazo conta a partir da ciência dele." tone="brand" size="md" data-testid="modal-informar"
      onSubmit={(e) => { e.preventDefault(); if (pronto && !busy) void salvar(); }}
      footer={<><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || !pronto}>{busy ? 'Gravando…' : 'Informar'}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SgoField label="Unidade" required><Select aria-label="Unidade da ocorrência" value={unitId} onValueChange={(v) => { setUnitId(v); setExpectedUserId(''); }} options={units.map((u) => ({ value: u.id, label: u.name }))} /></SgoField>
        <SgoField label="Referência" required hint={cat.referencia}><Input value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Referência" /></SgoField>
        <DatePicker label={cat.fato} value={eventDate || null} onValueChange={(v) => setEventDate(v ?? '')} />
        <SgoField label="Ciência do gerente (data e hora)" required hint="Quando o gerente soube — o prazo de lançamento conta daqui.">
          <Input type="datetime-local" value={noticeAt} onChange={(e) => setNoticeAt(e.target.value)} aria-label="Ciência do gerente" />
        </SgoField>
        <SgoField label="Origem da informação" required><Select aria-label="Origem da informação" value={source} onValueChange={setSource} options={ORIGENS.map((o) => ({ value: o, label: ROTULO_ORIGEM[o] }))} /></SgoField>
        <SgoField label="Detalhe da origem" hint="Quem avisou, documento visto… (opcional)"><Input value={sourceDetail} onChange={(e) => setSourceDetail(e.target.value)} aria-label="Detalhe da origem" /></SgoField>
        <SgoField label="Responsável previsto pelo lançamento" hint="Gerente ou coordenador da unidade (opcional). A responsabilidade só é atribuída de fato na decisão da supervisão.">
          <Select aria-label="Responsável previsto" value={expectedUserId || null} onValueChange={setExpectedUserId} options={[{ value: '', label: 'Não indicar' }, ...gerentes.map((g) => ({ value: g.id, label: g.name }))]} placeholder="Não indicar" />
        </SgoField>
        <SgoField label="Observação"><Input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Observação" /></SgoField>
      </div>
      {erro && <p className="mt-2 text-sm font-medium text-danger">{erro}</p>}
    </SgoModal>
  );
}

function VincularModal({ ocorrencia, onClose, onSaved }: { ocorrencia: OcorrenciaDaAuditoria; onClose: () => void; onSaved: () => void }) {
  const [entryId, setEntryId] = useState(ocorrencia.candidatos[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function vincular() {
    setBusy(true); setErro(null);
    const r = await post({ acao: 'vincular', id: ocorrencia.id, entryId });
    setBusy(false);
    if (r.ok) onSaved(); else setErro(r.error ?? 'Falha');
  }
  async function desvincular() {
    setBusy(true); setErro(null);
    const r = await post({ acao: 'desvincular', id: ocorrencia.id });
    setBusy(false);
    if (r.ok) onSaved(); else setErro(r.error ?? 'Falha');
  }
  return (
    <SgoModal open onClose={() => (busy ? undefined : onClose())} title={`Lançamento — ${ocorrencia.reference}`} subtitle="O cruzamento automático prende quando há UM lançamento na janela (±3 dias do fato). Aqui a supervisão decide à mão." tone="brand" size="sm" data-testid="modal-vincular"
      onSubmit={(e) => { e.preventDefault(); if (entryId && !busy) void vincular(); }}
      footer={<><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>{ocorrencia.lancamento && <Button type="button" variant="ghost" disabled={busy} onClick={desvincular}>Desvincular</Button>}<Button type="submit" disabled={busy || !entryId}>{busy ? 'Gravando…' : 'Vincular'}</Button></>}>
      <div className="space-y-3">
        {ocorrencia.lancamento && <p className="rounded-lg border border-line bg-sunken p-2 text-sm"><b>Vinculado:</b> {hora(ocorrencia.lancamento.lancadoEm)} por {ocorrencia.lancamento.lancadoPor ?? '—'}{ocorrencia.lancamento.descricao ? ` · ${ocorrencia.lancamento.descricao}` : ''}</p>}
        {ocorrencia.candidatos.length === 0 ? (
          <p className="text-sm text-ink-500">{ocorrencia.lancamento ? 'Não há outro lançamento livre na janela.' : 'Nenhum lançamento livre na janela desta ocorrência. Se o gerente lançou com outra data, corrija a data do lançamento ou invalide a ocorrência.'}</p>
        ) : (
          <SgoField label="Lançamentos livres na janela" required>
            <Select aria-label="Lançamento" value={entryId || null} onValueChange={setEntryId} options={ocorrencia.candidatos.map((c) => ({ value: c.id, label: `${br(c.data)} · ${c.descricao} · lançado ${hora(c.lancadoEm)}${c.lancadoPor ? ` por ${c.lancadoPor}` : ''}` }))} placeholder="Escolha…" />
          </SgoField>
        )}
        {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
      </div>
    </SgoModal>
  );
}

function JustificarModal({ ocorrencia, onClose, onSaved }: { ocorrencia: OcorrenciaDaAuditoria; onClose: () => void; onSaved: () => void }) {
  const [texto, setTexto] = useState(ocorrencia.justification ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    setBusy(true); setErro(null);
    const r = await post({ acao: 'justificar', id: ocorrencia.id, texto });
    setBusy(false);
    if (r.ok) onSaved(); else setErro(r.error ?? 'Falha');
  }
  return (
    <SgoModal open onClose={() => (busy ? undefined : onClose())} title={`Justificar — ${ocorrencia.reference}`} subtitle="A justificativa só conta depois de aprovada pela supervisão." tone="amber" size="sm" data-testid="modal-justificar"
      onSubmit={(e) => { e.preventDefault(); if (texto.trim().length >= MOTIVO_MIN && !busy) void salvar(); }}
      footer={<><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || texto.trim().length < MOTIVO_MIN}>{busy ? 'Enviando…' : 'Enviar justificativa'}</Button></>}>
      <Label className="text-xs">Por que o lançamento atrasou ou não aconteceu? (mínimo {MOTIVO_MIN} caracteres)</Label>
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} aria-label="Justificativa" />
      {erro && <p className="mt-2 text-sm font-medium text-danger">{erro}</p>}
    </SgoModal>
  );
}

function RevisarModal({ ocorrencia, gerentes, onClose, onSaved }: { ocorrencia: OcorrenciaDaAuditoria; gerentes: Pessoa[]; onClose: () => void; onSaved: () => void }) {
  const [decisao, setDecisao] = useState<'FALHA' | 'JUSTIFICADO' | 'INVALIDO' | 'REABRIR'>(ocorrencia.justification && ocorrencia.reviewStatus !== 'JUSTIFICADO' ? 'JUSTIFICADO' : ocorrencia.reviewStatus === 'AGUARDANDO' ? 'FALHA' : 'REABRIR');
  const [responsavel, setResponsavel] = useState(ocorrencia.responsibleUserId ?? '');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const opcoes = [
    ...(ocorrencia.reviewStatus === 'AGUARDANDO' || ocorrencia.reviewStatus === 'JUSTIFICADO' ? [{ value: 'FALHA', label: 'Confirmar falha (prazo vencido, sem justificativa aprovada)' }] : []),
    ...(ocorrencia.justification ? [{ value: 'JUSTIFICADO', label: 'Aprovar a justificativa (conta como conforme)' }] : []),
    { value: 'INVALIDO', label: 'Invalidar a ocorrência (não procedia)' },
    ...(ocorrencia.reviewStatus !== 'AGUARDANDO' ? [{ value: 'REABRIR', label: 'Reabrir (volta para conferência)' }] : []),
  ];
  const pronto = decisao !== 'INVALIDO' || nota.trim().length >= MOTIVO_MIN;
  async function salvar() {
    setBusy(true); setErro(null);
    const r = await post({ acao: 'revisar', id: ocorrencia.id, decisao, nota, responsibleUserId: decisao === 'FALHA' ? responsavel || null : null });
    setBusy(false);
    if (r.ok) onSaved(); else setErro(r.error ?? 'Falha');
  }
  return (
    <SgoModal open onClose={() => (busy ? undefined : onClose())} title={`Decidir — ${ocorrencia.reference} (${br(ocorrencia.eventDate)})`} subtitle="Só a falha CONFIRMADA entra na conformidade; a responsabilidade individual nasce aqui." tone="brand" size="sm" data-testid="modal-revisar"
      onSubmit={(e) => { e.preventDefault(); if (pronto && !busy) void salvar(); }}
      footer={<><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || !pronto}>{busy ? 'Gravando…' : 'Confirmar decisão'}</Button></>}>
      <div className="space-y-3">
        {ocorrencia.justification && <p className="rounded-lg border border-line bg-sunken p-2 text-sm"><b>Justificativa de {ocorrencia.justifiedByName}:</b> {ocorrencia.justification}</p>}
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
