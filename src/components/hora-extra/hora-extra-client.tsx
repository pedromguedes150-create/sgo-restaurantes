'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BarChart3, CalendarCheck, Clock, Download, Gauge, Link2, ListChecks, Plus, Receipt, Settings, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/ds/table';
import { Select as DsSelect } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { SearchField } from '@/components/ui/ds/field';
import { StatusBadge, type Tone } from '@/components/ui/ds/status-badge';
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { SgoBar } from '@/components/sgo/sgo-bar';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { SgoDrawer } from '@/components/sgo/sgo-drawer';
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
 *
 * Fase 4 do kit (v1.145.0): cabeçalho [título] — [abas] — [ações] do kit,
 * `.sgo-filtros`, `.sgo-kpis`, painéis `.sgo-panel`, tabela `.sgo-tbl`,
 * SgoModal para criar e SgoDrawer para consultar. Dados, filtros e regras: os
 * mesmos.
 */

const TONE: Record<HoraExtra['status'], Tone> = { PENDING: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'danger' };
/* A mesma cor do selo, no gráfico de status: pendente âmbar, aprovada azul-claro
   (`sky`, o tom semântico do kit — não a marca), paga verde, reprovada vermelha. */
const COR_STATUS: Record<HoraExtra['status'], string> = { PENDING: 'var(--sgo-warn)', APPROVED: 'var(--sgo-sky)', PAID: 'var(--sgo-ok)', REJECTED: 'var(--sgo-bad)' };

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
  const linkDaAba = (aba: FiltroHE['aba']) => `${base}?${queryDoFiltroHE({ ...p.filtro, aba })}`;

  return (
    <div className="space-y-4">
      {/* As abas são de ESTADO (mesma rota, `?aba=`): `active` explícito, senão
          as três casariam a mesma rota e ficariam todas acesas. */}
      <LargeTitle
        title="Hora extra"
        subtitle="Painel por motivo e período, lista para conferência e o fechamento da competência (paga no mês seguinte ao trabalho)."
        tabs={[
          { label: 'Dashboard', icon: <BarChart3 className="h-3.5 w-3.5" />, href: linkDaAba('dashboard'), active: p.filtro.aba === 'dashboard', testId: 'aba-dashboard' },
          { label: 'Solicitações', icon: <ListChecks className="h-3.5 w-3.5" />, href: linkDaAba('solicitacoes'), active: p.filtro.aba === 'solicitacoes', badge: p.resumo.pendentes.qtd || undefined, testId: 'aba-solicitacoes' },
          { label: 'Fechamento', icon: <CalendarCheck className="h-3.5 w-3.5" />, href: linkDaAba('fechamento'), active: p.filtro.aba === 'fechamento', testId: 'aba-fechamento' },
        ]}
        actions={(
          /* As ações quebram linha no celular (o kit as mantém numa linha só). */
          <div className="flex flex-wrap items-center gap-2">
            {p.filtro.aba !== 'fechamento' && (
              <a href={`/api/hora-extra/export?${queryAtual}`} className="sgo-btn">
                <Download className="h-3.5 w-3.5" /> Exportar xlsx
              </a>
            )}
            {p.isAdmin && (
              <Link href="/configuracoes/pagamentos#motivos-hora-extra" className="sgo-btn">
                <Settings className="h-3.5 w-3.5" /> Configurar
              </Link>
            )}
            {p.podeLancar && (
              <button type="button" className="sgo-btn sgo-btn--primary" onClick={() => setNovaAberta(true)}><Plus className="h-3.5 w-3.5" /> Nova solicitação</button>
            )}
          </div>
        )}
      />

      {p.podeVincular && p.semVinculo.length > 0 && (
        <div className="sgo-aviso sgo-aviso--atencao flex-wrap items-center justify-between" data-testid="aviso-sem-vinculo">
          <AlertTriangle />
          <span className="min-w-[14rem] flex-1">
            <b>{p.semVinculo.length} hora(s) extra(s) antiga(s) sem vínculo com o RH</b> — saem sem CPF e matrícula, e a mesma pessoa pode aparecer com dois nomes. O sistema já vinculou sozinho as que batiam com um só colaborador; estas precisam de você.
          </span>
          <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => setVinculoAberto(true)}><Link2 className="h-3.5 w-3.5" /> Vincular agora</button>
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

      {/* Criar = modal do kit (decisão, bloqueia o fundo). O formulário traz o
          próprio botão de enviar, então o modal não tem rodapé. */}
      <SgoModal
        open={novaAberta}
        onClose={() => setNovaAberta(false)}
        title="Nova solicitação de hora extra"
        subtitle="Entra no mesmo fluxo de Pagamentos: aprovação pela coordenação/supervisão e pagamento pelo Fechamento da competência."
        icon={<Clock className="h-4 w-4" />}
        tone="brand"
        size="sm"
      >
        {novaAberta && (
          <FormularioHoraExtra
            units={p.form.units}
            collaboratorsByUnit={p.form.collaboratorsByUnit}
            overtimeRatesByUnit={p.form.overtimeRatesByUnit}
            motivos={p.motivosCatalogo}
            onDone={() => { setNovaAberta(false); router.refresh(); }}
          />
        )}
      </SgoModal>

      {/* A fila de vínculo é trabalho em sequência com a tela atrás: painel lateral. */}
      <SgoDrawer
        open={vinculoAberto}
        onClose={() => setVinculoAberto(false)}
        title="Vincular hora extra ao colaborador do RH"
        subtitle="Hora extra lançada antes do cadastro por RH guarda só o nome digitado. Escolha quem é cada uma — o nome original fica no histórico, e CPF e matrícula passam a vir do cadastro."
        icon={<Link2 className="h-4 w-4" />}
        tone="amber"
        size="lg"
      >
        {vinculoAberto && <FilaDeVinculo itens={p.semVinculo} onMudou={() => router.refresh()} />}
      </SgoDrawer>
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
          <div className="min-w-[8.5rem] flex-1"><DatePicker label="De" value={filtro.de ?? periodo.de} onValueChange={(v) => onChange({ de: v ?? undefined })} size="sm" /></div>
          <div className="min-w-[8.5rem] flex-1"><DatePicker label="Até" value={filtro.ate ?? periodo.ate} onValueChange={(v) => onChange({ ate: v ?? undefined })} size="sm" /></div>
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
      <div>
        <SgoKpis className="grid-cols-2 md:grid-cols-3 lg:grid-cols-6" flush>
          <SgoKpi label="Total pago" value={formatBRL(resumo.totalPago)} meta={`a pagar: ${formatBRL(resumo.aPagar)}`} icon={Wallet} tone="green" />
          <SgoKpi label="Total de horas" value={textoHoras(resumo.horas)} icon={Clock} tone="blue" />
          <SgoKpi label="Solicitações" value={String(resumo.solicitacoes)} meta={resumo.reprovadas ? `${resumo.reprovadas} reprovada(s) fora` : `${resumo.colaboradores} colaborador(es)`} icon={Users} tone="violet" />
          <SgoKpi label="Média / solicitação" value={resumo.mediaPorSolicitacao != null ? formatBRL(resumo.mediaPorSolicitacao) : '–'} icon={Receipt} tone="sky" />
          <SgoKpi label="Valor médio / hora" value={resumo.valorPorHora != null ? formatBRL(resumo.valorPorHora) : '–'} meta="valor ÷ horas (VT incluso)" icon={Gauge} tone="gray" />
          <SgoKpi label="Pendentes" value={String(resumo.pendentes.qtd)} meta={formatBRL(resumo.pendentes.valor)} metaTone={resumo.pendentes.qtd ? 'warn' : undefined} icon={AlertTriangle} tone={resumo.pendentes.qtd ? 'amber' : 'gray'} valueColor={resumo.pendentes.qtd ? 'var(--sgo-warn)' : undefined} />
        </SgoKpis>
        <p className="mt-2 text-xs" style={{ color: 'var(--sgo-ink-2)' }}>Valores das solicitações não reprovadas em <b>{periodo.rotulo}</b>, pelo dia trabalhado. O VT já está dentro de cada valor.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Comparativo por motivo" icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><BarChart3 className="h-4 w-4" /></span>} count={motivos.length} />
          <div className="px-4 py-3">
            <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>Valor por motivo do catálogo — clique para ver as solicitações.</p>
            {motivos.length === 0 ? <p className="mt-3 text-sm" style={{ color: 'var(--sgo-ink-2)' }}>Nenhuma hora extra no período.</p> : (
              <ul className="mt-3 space-y-2.5" data-testid="por-motivo">
                {motivos.map((m) => (
                  <li key={m.motivoId ?? 'outro'}>
                    <button type="button" onClick={() => onMotivo(m.motivoId ?? FILTRO_OUTRO)} className="w-full rounded-md text-left outline-none focus-visible:shadow-sgo-focus">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold" style={{ color: 'var(--sgo-ink)' }}>{m.motivo}</span>
                        <span className="text-xs tabular-nums" style={{ color: 'var(--sgo-ink-2)' }}>{formatBRL(m.valor)} · {m.qtd} · {textoHoras(m.horas)} · {m.pct}%</span>
                      </div>
                      <SgoBar value={Math.max(2, Math.round((m.valor / maxMotivo) * 100))} tone="blue" className="mt-1.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Status das solicitações" icon={<span className="sgo-panel__ic sgo-panel__ic--amber" aria-hidden><ListChecks className="h-4 w-4" /></span>} count={totalStatus} />
          <div className="px-4 py-3">
            <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>Todas as solicitações do período, inclusive reprovadas.</p>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-pill" style={{ background: 'rgb(var(--sgo-ink-500-rgb) / 0.16)' }} aria-hidden>
              {status.filter((s) => s.qtd > 0).map((s) => (
                <div key={s.status} style={{ width: `${(s.qtd / Math.max(1, totalStatus)) * 100}%`, background: COR_STATUS[s.status] }} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2" data-testid="por-status">
              {status.map((s) => (
                <li key={s.status} className="flex items-center gap-2 text-sm">
                  <span className="inline-block h-2.5 w-2.5 rounded-pill" style={{ background: COR_STATUS[s.status] }} aria-hidden />
                  <span style={{ color: 'var(--sgo-ink)' }}>{s.rotulo}</span>
                  <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--sgo-ink-2)' }}>{s.qtd} · {formatBRL(s.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Card>
        <PanelHeader title="Evolução mensal" icon={<span className="sgo-panel__ic sgo-panel__ic--green" aria-hidden><Clock className="h-4 w-4" /></span>} />
        <div className="px-4 py-3">
          <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>Valor e horas por mês do dia trabalhado.</p>
          <div className="mt-3 flex items-end gap-2 overflow-x-auto" data-testid="evolucao">
            {evolucao.map((m) => (
              <div key={m.mes} className="flex min-w-[3.5rem] flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular-nums" style={{ color: 'var(--sgo-ink-2)' }}>{m.valor ? formatBRL(m.valor) : '–'}</span>
                <div className="flex h-32 w-full items-end rounded-md px-1" style={{ background: 'rgb(var(--sgo-ink-500-rgb) / 0.10)' }}>
                  <div className="w-full rounded-t-md" style={{ height: `${m.valor ? Math.max(4, Math.round((m.valor / maxMes) * 100)) : 0}%`, background: 'var(--sgo-accent)' }} title={`${m.qtd} solicitação(ões) · ${textoHoras(m.horas)}`} />
                </div>
                <span className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>{m.rotulo}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--sgo-ink-3)' }}>{m.qtd ? `${m.qtd} · ${textoHoras(m.horas)}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
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
        <div>
          <p className="text-sm" style={{ color: 'var(--sgo-ink)' }}>
            <b>{hes.length}</b> solicitação(ões) · {formatBRL(total)} (sem reprovadas) · {resumo.colaboradores} colaborador(es)
            {resumo.semVinculo > 0 && <> · <span style={{ color: 'var(--sgo-warn)' }}>{resumo.semVinculo} sem vínculo com o RH</span></>}
          </p>
          <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>Aprovar, reprovar e corrigir continuam em <Link href="/modulos/pagamentos" className="font-semibold underline" style={{ color: 'var(--sgo-accent)' }}>Pagamentos</Link>. O pagamento é pelo Fechamento da competência.</p>
        </div>
        <div className="w-44">
          <DsSelect label="Ordenar por" size="sm" value={ordem} onValueChange={(v) => setOrdem(v as OrdemHE)} options={[
            { value: 'data', label: 'Data (recentes)' }, { value: 'colaborador', label: 'Colaborador' }, { value: 'unidade', label: 'Unidade' }, { value: 'valor', label: 'Maior valor' }, { value: 'status', label: 'Status' },
          ]} />
        </div>
      </div>
      <Table<HoraExtra>
        rows={linhas}
        getRowKey={(h) => h.id}
        onRowClick={setAberta}
        empty="Nenhuma hora extra com estes filtros."
        columns={[
          { key: 'colaborador', header: 'Colaborador', cell: (h) => (
            <div className="min-w-0">
              <p className="truncate font-semibold" style={{ color: 'var(--sgo-ink)' }}>{h.colaborador}{!h.collaboratorId && <AlertTriangle className="ml-1 inline h-3.5 w-3.5" style={{ color: 'var(--sgo-warn)' }} aria-label="Sem vínculo com o RH" />}</p>
              <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>{h.matricula ? `Matr. ${h.matricula}` : 'sem matrícula'}{h.cpf ? ` · ${cpfBr(h.cpf)}` : ''}</p>
            </div>
          ) },
          { key: 'unidade', header: 'Unidade', cell: (h) => shortUnitName(h.unidade), hideOnMobile: true },
          { key: 'dia', header: 'Data', cell: (h) => dataBr(h.dia) },
          { key: 'detalhes', header: 'Detalhes', cell: (h) => <span className="tabular-nums">{h.inicio && h.fim ? `${h.inicio}–${h.fim}` : '—'}{h.horas != null ? ` (${textoHoras(h.horas)})` : ''}</span>, hideOnMobile: true },
          { key: 'motivo', header: 'Motivo', wrap: true, cell: (h) => (
            <div className="min-w-0">
              <p>{h.motivo}</p>
              {h.detalhe && <p className="truncate text-xs" style={{ color: 'var(--sgo-ink-2)' }} title={h.detalhe}>{h.detalhe}</p>}
            </div>
          ), hideOnMobile: true },
          { key: 'valor', header: 'Valor', numeric: true, cell: (h) => <span className="font-semibold tabular-nums">{formatBRL(h.valor)}</span> },
          { key: 'status', header: 'Status', cell: (h) => <StatusBadge tone={TONE[h.status]}>{STATUS_TEXTO[h.status]}</StatusBadge> },
        ]}
      />
      {/* Consultar = painel lateral do kit: a ficha abre e a lista fica atrás. */}
      <SgoDrawer
        open={aberta != null}
        onClose={() => setAberta(null)}
        title={aberta ? aberta.colaborador : ''}
        subtitle={aberta ? `${shortUnitName(aberta.unidade)} · ${dataBr(aberta.dia)}` : undefined}
        icon={<Clock className="h-4 w-4" />}
        tone="blue"
        size="sm"
      >
        {aberta && <DetalheDaHE h={aberta} />}
      </SgoDrawer>
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
    <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
      {linhas.map(([k, v]) => (<div key={k} className="contents"><dt className="sgo-label self-center">{k}</dt><dd style={{ color: 'var(--sgo-ink)' }}>{v}</dd></div>))}
      {!h.collaboratorId && <p className="sgo-aviso sgo-aviso--atencao col-span-2 mt-2"><AlertTriangle /><span>Sem vínculo com o cadastro do RH — por isso sem CPF e matrícula. Use &ldquo;Vincular agora&rdquo; no alto da tela.</span></p>}
      <p className="col-span-2 mt-2"><Link href="/modulos/pagamentos" className="sgo-btn">Abrir em Pagamentos</Link></p>
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
  if (pendentes.length === 0) return <p className="text-sm" style={{ color: 'var(--sgo-ok)' }}>Tudo vinculado.</p>;
  return (
    <div className="space-y-3">
      {erro && <p className="sgo-aviso sgo-aviso--bloqueio"><AlertTriangle /><span>{erro}</span></p>}
      {pendentes.map((i) => {
        const sug = new Set(i.sugestoes.map((s) => s.id));
        const opcoes = [
          ...i.sugestoes.map((s) => ({ value: s.id, label: s.name, hint: `sugerido${s.jobTitle ? ` · ${s.jobTitle}` : ''}` })),
          ...i.opcoes.filter((o) => !sug.has(o.id)).map((o) => ({ value: o.id, label: o.name, hint: o.jobTitle ?? undefined })),
        ];
        return (
          <div key={i.id} className="sgo-panel sgo-panel--solid p-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--sgo-ink)' }}>&ldquo;{i.nome}&rdquo; <span className="font-normal" style={{ color: 'var(--sgo-ink-2)' }}>· {shortUnitName(i.unidade)} · {i.dia ? dataBr(i.dia) : '—'} · {formatBRL(i.valor)}</span></p>
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
