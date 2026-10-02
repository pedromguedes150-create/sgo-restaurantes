'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock, Download, Link2, Plus, Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/ds/stat-card';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { Sheet } from '@/components/ui/ds/sheet';
import { Modal } from '@/components/ui/ds/modal';
import { Table } from '@/components/ui/ds/table';
import { Select as DsSelect } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { SearchField } from '@/components/ui/ds/field';
import { StatusBadge, type Tone } from '@/components/ui/ds/status-badge';
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar';
import { formatBRL } from '@/lib/utils';
import { shortUnitName } from '@/lib/unit-name';
import { textoHoras } from '@/lib/overtime/calculo';
import { competenciaDaHoraExtra, rotuloDaCompetencia } from '@/lib/people/pagamento-extra-calculo';
import {
  FILTRO_OUTRO, MOTIVO_OUTRO, PERIODOS_HE, STATUS_HE, STATUS_TEXTO, cpfBr, dataBr, ordenarHE, queryDoFiltroHE,
  type FatiaDeMotivo, type FatiaDeStatus, type FiltroHE, type HoraExtra, type MesDaEvolucao, type OrdemHE, type Periodo, type ResumoHE,
} from '@/lib/hora-extra/calculo';
import { FormularioHoraExtra, type ColaboradorOpt, type MotivoOpt, type UnidadeOpt } from '@/components/payments/formulario-hora-extra';
import { PayoutsCompetenciaClient, type QuadroUI } from '@/components/people/payouts-competencia-client';
import type { PendenciaDeVinculo } from '@/lib/hora-extra/vinculo';

/**
 * HORA EXTRA — a tela (v1.142.0). Três abas, uma base:
 *
 *  - **Dashboard**: KPIs, comparativo por MOTIVO (catálogo), status das
 *    solicitações e evolução mensal — tudo da MESMA lista da aba seguinte.
 *  - **Solicitações**: a lista, para CONSULTA. Aprovar e reprovar continuam em
 *    Pagamentos (decisão do Pedro: a tela não aprova); aqui se procura,
 *    confere e exporta.
 *  - **Fechamento**: o quadro por competência que era o "Pagamento Extra" —
 *    finalizar marca as HE como pagas (cartão de benefício) e sai o arquivo
 *    da administradora.
 *
 * O filtro vive na URL (`queryDoFiltroHE`): o Excel sai do mesmo endereço, e o
 * link que o supervisor manda já abre certo.
 */

const TONE: Record<HoraExtra['status'], Tone> = { PENDING: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'danger' };
const COR_STATUS: Record<HoraExtra['status'], string> = { PENDING: 'bg-warning', APPROVED: 'bg-brand', PAID: 'bg-success', REJECTED: 'bg-danger' };

export interface FechamentoUI { quadro: QuadroUI; competencia: string; meses: string[] }

export interface HoraExtraClientProps {
  filtro: FiltroHE;
  periodo: Periodo;
  hes: HoraExtra[];
  resumo: ResumoHE;
  motivos: FatiaDeMotivo[];
  status: FatiaDeStatus[];
  evolucao: MesDaEvolucao[];
  unidades: { id: string; name: string }[];
  motivosCatalogo: MotivoOpt[];
  semVinculo: PendenciaDeVinculo[];
  fechamento?: FechamentoUI;
  form: { units: UnidadeOpt[]; collaboratorsByUnit: Record<string, ColaboradorOpt[]>; overtimeRatesByUnit: Record<string, number[]> };
  podeLancar: boolean;
  podeFechar: boolean;
  podeVincular: boolean;
  isAdmin: boolean;
}

export function HoraExtraClient(p: HoraExtraClientProps) {
  const router = useRouter();
  const [novaAberta, setNovaAberta] = useState(false);
  const [vinculoAberto, setVinculoAberto] = useState(false);
  const base = '/modulos/hora-extra';
  const ir = (patch: Partial<FiltroHE>) => {
    const q = queryDoFiltroHE({ ...p.filtro, ...patch });
    router.push(q ? `${base}?${q}` : base);
  };
  const queryAtual = queryDoFiltroHE({ ...p.filtro, aba: 'dashboard' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedNav
          aria-label="Seção"
          options={[
            { value: 'dashboard', label: 'Dashboard', href: `${base}?${queryDoFiltroHE({ ...p.filtro, aba: 'dashboard' })}` },
            { value: 'solicitacoes', label: 'Solicitações', badge: p.resumo.pendentes.qtd || undefined, href: `${base}?${queryDoFiltroHE({ ...p.filtro, aba: 'solicitacoes' })}` },
            { value: 'fechamento', label: 'Fechamento', href: `${base}?${queryDoFiltroHE({ ...p.filtro, aba: 'fechamento' })}` },
          ]}
          value={p.filtro.aba}
        />
        <div className="flex flex-wrap items-center gap-2">
          {p.filtro.aba !== 'fechamento' && (
            <a href={`/api/hora-extra/export?${queryAtual}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand">
              <Download className="h-4 w-4" /> Exportar xlsx
            </a>
          )}
          {p.isAdmin && (
            <Link href="/configuracoes/pagamentos#motivos-hora-extra" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand">
              <Settings className="h-4 w-4" /> Configurar
            </Link>
          )}
          {p.podeLancar && (
            <Button size="sm" onClick={() => setNovaAberta(true)}><Plus className="h-4 w-4" /> Nova solicitação</Button>
          )}
        </div>
      </div>

      {p.podeVincular && p.semVinculo.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 sgo-type-13 text-ink-900" data-testid="aviso-sem-vinculo">
          <span>
            <AlertTriangle className="mr-1 inline h-4 w-4 text-warning" />
            <b>{p.semVinculo.length} hora(s) extra(s) antiga(s) sem vínculo com o RH</b> — saem sem CPF e matrícula, e a mesma pessoa pode aparecer com dois nomes. O sistema já vinculou sozinho as que batiam com um só colaborador; estas precisam de você.
          </span>
          <Button size="sm" variant="outline" onClick={() => setVinculoAberto(true)}><Link2 className="h-4 w-4" /> Vincular agora</Button>
        </div>
      )}

      {p.filtro.aba !== 'fechamento' && <Filtros filtro={p.filtro} periodo={p.periodo} unidades={p.unidades} motivos={p.motivosCatalogo} onChange={ir} />}

      {p.filtro.aba === 'dashboard' && <Dashboard resumo={p.resumo} motivos={p.motivos} status={p.status} evolucao={p.evolucao} periodo={p.periodo} onMotivo={(m) => ir({ aba: 'solicitacoes', motivo: m })} />}
      {p.filtro.aba === 'solicitacoes' && <Solicitacoes hes={p.hes} resumo={p.resumo} />}
      {p.filtro.aba === 'fechamento' && p.fechamento && (
        <PayoutsCompetenciaClient
          tipo="EXTRA"
          quadro={p.fechamento.quadro}
          competencia={p.fechamento.competencia}
          meses={p.fechamento.meses}
          colaboradores={[]}
          podeLancar={false}
          podeFecharExtra={p.podeFechar}
          isAdmin={p.isAdmin}
          basePath={`${base}?aba=fechamento`}
        />
      )}

      <Sheet open={novaAberta} onClose={() => setNovaAberta(false)} title="Nova solicitação de hora extra" description="Entra no mesmo fluxo de Pagamentos: aprovação pela coordenação/supervisão e pagamento pelo Fechamento da competência.">
        {novaAberta && (
          <FormularioHoraExtra
            units={p.form.units}
            collaboratorsByUnit={p.form.collaboratorsByUnit}
            overtimeRatesByUnit={p.form.overtimeRatesByUnit}
            motivos={p.motivosCatalogo}
            onDone={() => { setNovaAberta(false); router.refresh(); }}
          />
        )}
      </Sheet>

      <Sheet open={vinculoAberto} onClose={() => setVinculoAberto(false)} title="Vincular hora extra ao colaborador do RH" description="Hora extra lançada antes do cadastro por RH guarda só o nome digitado. Escolha quem é cada uma — o nome original fica no histórico, e CPF e matrícula passam a vir do cadastro.">
        {vinculoAberto && <FilaDeVinculo itens={p.semVinculo} onMudou={() => router.refresh()} />}
      </Sheet>
    </div>
  );
}

/* ───────────────────────── filtros ───────────────────────── */

function Filtros({ filtro, periodo, unidades, motivos, onChange }: {
  filtro: FiltroHE; periodo: Periodo; unidades: { id: string; name: string }[]; motivos: MotivoOpt[]; onChange: (patch: Partial<FiltroHE>) => void;
}) {
  const [q, setQ] = useState(filtro.q);
  const ativos = [filtro.unitId, filtro.status !== 'TODOS', filtro.motivo, filtro.q, filtro.periodo !== 'mes'].filter(Boolean).length;
  return (
    <FilterBar
      active={ativos}
      onClear={ativos ? () => { setQ(''); onChange({ periodo: 'mes', de: undefined, ate: undefined, unitId: undefined, status: 'TODOS', motivo: '', q: '' }); } : undefined}
      result={<>Período: <b>{periodo.rotulo}</b></>}
      search={<SearchField label="Buscar" inputSize="sm" placeholder="Colaborador, matrícula, motivo…" value={q} onValueChange={setQ} onKeyDown={(e) => { if (e.key === 'Enter') onChange({ q }); }} onBlur={() => { if (q !== filtro.q) onChange({ q }); }} />}
    >
      <FilterSelect label="Período" value={filtro.periodo} onValueChange={(v) => onChange({ periodo: v as FiltroHE['periodo'] })} options={PERIODOS_HE} />
      {filtro.periodo === 'personalizado' && (
        <>
          <div className="min-w-[8.5rem] flex-1"><DatePicker label="De" value={filtro.de ?? periodo.de} onValueChange={(v) => onChange({ de: v ?? undefined })} /></div>
          <div className="min-w-[8.5rem] flex-1"><DatePicker label="Até" value={filtro.ate ?? periodo.ate} onValueChange={(v) => onChange({ ate: v ?? undefined })} /></div>
        </>
      )}
      {unidades.length > 1 && (
        <FilterSelect label="Unidade" value={filtro.unitId ?? ''} onValueChange={(v) => onChange({ unitId: v || undefined })} options={[{ value: '', label: 'Todas' }, ...unidades.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]} />
      )}
      <FilterSelect label="Status" value={filtro.status} onValueChange={(v) => onChange({ status: v as FiltroHE['status'] })} options={STATUS_HE} />
      <FilterSelect label="Motivo" value={filtro.motivo} onValueChange={(v) => onChange({ motivo: v })} options={[{ value: '', label: 'Todos' }, ...motivos.map((m) => ({ value: m.id, label: m.name })), { value: FILTRO_OUTRO, label: `${MOTIVO_OUTRO} (texto livre / antigas)` }]} />
    </FilterBar>
  );
}

/* ───────────────────────── dashboard ───────────────────────── */

function Dashboard({ resumo, motivos, status, evolucao, periodo, onMotivo }: {
  resumo: ResumoHE; motivos: FatiaDeMotivo[]; status: FatiaDeStatus[]; evolucao: MesDaEvolucao[]; periodo: Periodo; onMotivo: (m: string) => void;
}) {
  const maxMotivo = Math.max(1, ...motivos.map((m) => m.valor));
  const maxMes = Math.max(1, ...evolucao.map((m) => m.valor));
  const totalStatus = status.reduce((s, x) => s + x.qtd, 0);
  return (
    <div className="space-y-4" data-testid="he-dashboard">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total pago" value={formatBRL(resumo.totalPago)} hint={`a pagar: ${formatBRL(resumo.aPagar)}`} tone="success" />
        <StatCard label="Total de horas" value={textoHoras(resumo.horas)} icon={Clock} />
        <StatCard label="Solicitações" value={String(resumo.solicitacoes)} hint={resumo.reprovadas ? `${resumo.reprovadas} reprovada(s) fora` : `${resumo.colaboradores} colaborador(es)`} icon={Users} />
        <StatCard label="Média / solicitação" value={resumo.mediaPorSolicitacao != null ? formatBRL(resumo.mediaPorSolicitacao) : null} />
        <StatCard label="Valor médio / hora" value={resumo.valorPorHora != null ? formatBRL(resumo.valorPorHora) : null} hint="valor ÷ horas (VT incluso)" />
        <StatCard label="Pendentes" value={String(resumo.pendentes.qtd)} hint={formatBRL(resumo.pendentes.valor)} tone={resumo.pendentes.qtd ? 'warning' : 'default'} />
      </div>
      <p className="sgo-type-11 text-ink-500">Valores das solicitações não reprovadas em <b>{periodo.rotulo}</b>, pelo dia trabalhado. O VT já está dentro de cada valor.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-4">
          <h3 className="sgo-type-15 font-semibold text-ink-900">Comparativo por motivo</h3>
          <p className="sgo-type-11 text-ink-500">Valor por motivo do catálogo — clique para ver as solicitações.</p>
          {motivos.length === 0 ? <p className="mt-3 text-sm text-ink-500">Nenhuma hora extra no período.</p> : (
            <ul className="mt-3 space-y-2" data-testid="por-motivo">
              {motivos.map((m) => (
                <li key={m.motivoId ?? 'outro'}>
                  <button type="button" onClick={() => onMotivo(m.motivoId ?? FILTRO_OUTRO)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2 sgo-type-13">
                      <span className="font-semibold text-ink-900">{m.motivo}</span>
                      <span className="tabular-nums text-ink-700">{formatBRL(m.valor)} · {m.qtd} · {textoHoras(m.horas)} · {m.pct}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-pill bg-sunken">
                      <div className="h-full rounded-pill bg-brand" style={{ width: `${Math.max(2, Math.round((m.valor / maxMotivo) * 100))}%` }} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-line bg-surface p-4">
          <h3 className="sgo-type-15 font-semibold text-ink-900">Status das solicitações</h3>
          <p className="sgo-type-11 text-ink-500">Todas as solicitações do período, inclusive reprovadas.</p>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-pill bg-sunken" aria-hidden>
            {status.filter((s) => s.qtd > 0).map((s) => (
              <div key={s.status} className={COR_STATUS[s.status]} style={{ width: `${(s.qtd / Math.max(1, totalStatus)) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2" data-testid="por-status">
            {status.map((s) => (
              <li key={s.status} className="flex items-center gap-2 sgo-type-13">
                <span className={`inline-block h-2.5 w-2.5 rounded-pill ${COR_STATUS[s.status]}`} aria-hidden />
                <span className="text-ink-900">{s.rotulo}</span>
                <span className="ml-auto tabular-nums text-ink-700">{s.qtd} · {formatBRL(s.valor)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="sgo-type-15 font-semibold text-ink-900">Evolução mensal</h3>
        <p className="sgo-type-11 text-ink-500">Valor e horas por mês do dia trabalhado.</p>
        <div className="mt-3 flex items-end gap-2 overflow-x-auto" data-testid="evolucao">
          {evolucao.map((m) => (
            <div key={m.mes} className="flex min-w-[3.5rem] flex-1 flex-col items-center gap-1">
              <span className="sgo-type-11 tabular-nums text-ink-700">{m.valor ? formatBRL(m.valor) : '–'}</span>
              <div className="flex h-32 w-full items-end rounded bg-sunken px-1">
                <div className="w-full rounded-t bg-brand" style={{ height: `${m.valor ? Math.max(4, Math.round((m.valor / maxMes) * 100)) : 0}%` }} title={`${m.qtd} solicitação(ões) · ${textoHoras(m.horas)}`} />
              </div>
              <span className="sgo-type-11 text-ink-500">{m.rotulo}</span>
              <span className="sgo-type-11 tabular-nums text-ink-500">{m.qtd ? `${m.qtd} · ${textoHoras(m.horas)}` : ''}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── solicitações ───────────────────────── */

function Solicitacoes({ hes, resumo }: { hes: HoraExtra[]; resumo: ResumoHE }) {
  const [ordem, setOrdem] = useState<OrdemHE>('data');
  const [aberta, setAberta] = useState<HoraExtra | null>(null);
  const linhas = useMemo(() => ordenarHE(hes, ordem), [hes, ordem]);
  const total = hes.filter((h) => h.status !== 'REJECTED').reduce((s, h) => s + h.valor, 0);
  return (
    <div className="space-y-3" data-testid="he-solicitacoes">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="sgo-type-13 text-ink-700">
          <b>{hes.length}</b> solicitação(ões) · {formatBRL(total)} (sem reprovadas) · {resumo.colaboradores} colaborador(es)
          {resumo.semVinculo > 0 && <> · <span className="text-warning">{resumo.semVinculo} sem vínculo com o RH</span></>}
        </p>
        <div className="w-44">
          <DsSelect label="Ordenar por" size="sm" value={ordem} onValueChange={(v) => setOrdem(v as OrdemHE)} options={[
            { value: 'data', label: 'Data (recentes)' }, { value: 'colaborador', label: 'Colaborador' }, { value: 'unidade', label: 'Unidade' }, { value: 'valor', label: 'Maior valor' }, { value: 'status', label: 'Status' },
          ]} />
        </div>
      </div>
      <p className="sgo-type-11 text-ink-500">Aprovar, reprovar e corrigir continuam em <Link href="/modulos/pagamentos" className="font-semibold text-brand underline">Pagamentos</Link>. O pagamento é pelo Fechamento da competência.</p>
      <Table<HoraExtra>
        rows={linhas}
        getRowKey={(h) => h.id}
        onRowClick={setAberta}
        empty="Nenhuma hora extra com estes filtros."
        columns={[
          { key: 'colaborador', header: 'Colaborador', cell: (h) => (
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{h.colaborador}{!h.collaboratorId && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-warning" aria-label="Sem vínculo com o RH" />}</p>
              <p className="sgo-type-11 text-ink-500">{h.matricula ? `Matr. ${h.matricula}` : 'sem matrícula'}{h.cpf ? ` · ${cpfBr(h.cpf)}` : ''}</p>
            </div>
          ) },
          { key: 'unidade', header: 'Unidade', cell: (h) => shortUnitName(h.unidade), hideOnMobile: true },
          { key: 'dia', header: 'Data', cell: (h) => dataBr(h.dia) },
          { key: 'detalhes', header: 'Detalhes', cell: (h) => <span className="tabular-nums">{h.inicio && h.fim ? `${h.inicio}–${h.fim}` : '—'}{h.horas != null ? ` (${textoHoras(h.horas)})` : ''}</span>, hideOnMobile: true },
          { key: 'motivo', header: 'Motivo', cell: (h) => (
            <div className="min-w-0">
              <p>{h.motivo}</p>
              {h.detalhe && <p className="truncate sgo-type-11 text-ink-500" title={h.detalhe}>{h.detalhe}</p>}
            </div>
          ), hideOnMobile: true },
          { key: 'valor', header: 'Valor', numeric: true, cell: (h) => <span className="font-semibold tabular-nums">{formatBRL(h.valor)}</span> },
          { key: 'status', header: 'Status', cell: (h) => <StatusBadge tone={TONE[h.status]}>{STATUS_TEXTO[h.status]}</StatusBadge> },
        ]}
      />
      <Modal open={aberta != null} onClose={() => setAberta(null)} title={aberta ? aberta.colaborador : ''} description={aberta ? `${shortUnitName(aberta.unidade)} · ${dataBr(aberta.dia)}` : undefined}>
        {aberta && <DetalheDaHE h={aberta} />}
      </Modal>
    </div>
  );
}

function DetalheDaHE({ h }: { h: HoraExtra }) {
  const comp = competenciaDaHoraExtra(h.dia);
  const linhas: [string, string][] = [
    ['Status', STATUS_TEXTO[h.status]],
    ['Matrícula (RH)', h.matricula ?? '—'],
    ['CPF (RH)', h.cpf ? cpfBr(h.cpf) : '—'],
    ['Período', h.inicio && h.fim ? `${h.inicio}–${h.fim}` : '—'],
    ['Horas', h.horas != null ? textoHoras(h.horas) : '—'],
    ['Valor/hora', h.valorHora != null ? `${formatBRL(h.valorHora)}/h` : '—'],
    ['Vale transporte', h.vt ? formatBRL(h.vt) : '—'],
    ['Valor', formatBRL(h.valor)],
    ['Motivo', h.motivo],
    ['Detalhe', h.detalhe ?? '—'],
    ['Solicitante', h.solicitante ?? '—'],
    ['Aprovador', h.aprovador ?? '—'],
    ['Competência (Fechamento)', comp ? rotuloDaCompetencia(comp) : '—'],
  ];
  if (h.status === 'REJECTED') linhas.push(['Motivo da reprovação', h.motivoReprovacao ?? '—']);
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 sgo-type-13">
      {linhas.map(([k, v]) => (<div key={k} className="contents"><dt className="text-ink-500">{k}</dt><dd className="text-ink-900">{v}</dd></div>))}
      {!h.collaboratorId && <p className="col-span-2 mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Sem vínculo com o cadastro do RH — por isso sem CPF e matrícula. Use &ldquo;Vincular agora&rdquo; no alto da tela.</p>}
      <p className="col-span-2 mt-2"><Link href="/modulos/pagamentos" className="font-semibold text-brand underline">Abrir em Pagamentos</Link></p>
    </dl>
  );
}

/* ───────────────────────── fila de vínculo ───────────────────────── */

function FilaDeVinculo({ itens, onMudou }: { itens: PendenciaDeVinculo[]; onMudou: () => void }) {
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState('');

  async function vincular(id: string) {
    const collaboratorId = escolha[id];
    if (!collaboratorId) return;
    setBusy(id); setErro('');
    const r = await fetch('/api/hora-extra/vinculo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'manual', id, collaboratorId }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setErro(String(d.error ?? 'Falha ao vincular.')); return; }
    setFeitas((s) => new Set(s).add(id));
    onMudou();
  }

  const pendentes = itens.filter((i) => !feitas.has(i.id));
  if (pendentes.length === 0) return <p className="text-sm text-success">Tudo vinculado.</p>;
  return (
    <div className="space-y-3">
      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
      {pendentes.map((i) => {
        const sug = new Set(i.sugestoes.map((s) => s.id));
        const opcoes = [
          ...i.sugestoes.map((s) => ({ value: s.id, label: s.name, hint: `sugerido${s.jobTitle ? ` · ${s.jobTitle}` : ''}` })),
          ...i.opcoes.filter((o) => !sug.has(o.id)).map((o) => ({ value: o.id, label: o.name, hint: o.jobTitle ?? undefined })),
        ];
        return (
          <div key={i.id} className="rounded-lg border border-line p-3">
            <p className="sgo-type-13 font-semibold text-ink-900">&ldquo;{i.nome}&rdquo; <span className="font-normal text-ink-500">· {shortUnitName(i.unidade)} · {i.dia ? dataBr(i.dia) : '—'} · {formatBRL(i.valor)}</span></p>
            <div className="mt-2 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <DsSelect label="Colaborador do RH" size="sm" searchable searchPlaceholder="Pesquisar…" placeholder={opcoes.length ? (i.sugestoes.length ? 'Sugestões primeiro…' : 'Escolha…') : 'Sem colaboradores nesta unidade'} value={escolha[i.id] ?? ''} onValueChange={(v) => setEscolha((e) => ({ ...e, [i.id]: v }))} options={opcoes} disabled={opcoes.length === 0} />
              </div>
              <Button size="sm" disabled={busy === i.id || !escolha[i.id]} onClick={() => vincular(i.id)}><Link2 className="h-4 w-4" /> Vincular</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
