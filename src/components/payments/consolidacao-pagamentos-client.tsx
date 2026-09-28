'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Download, FileText, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { StatCard } from '@/components/ui/ds/stat-card';
import { StatusBadge, type Tone } from '@/components/ui/ds/status-badge';
import { Banner } from '@/components/ui/ds/banner';
import { formatBRL } from '@/lib/utils';
import {
  PERIODOS_RAPIDOS, STATUS_CONS, STATUS_TEXTO, TIPO_TEXTO, TIPOS_CONS, emBR, entraNosTotais, ordenar, queryDoFiltro, textoHoras,
  type Consolidacao, type FiltroConsolidacao, type Lancamento, type Ordem, type PeriodoRapido, type Visao,
} from '@/lib/payments/consolidacao-calculo';

const BASE = '/modulos/pagamentos/consolidacao';
const TOM_STATUS: Record<Lancamento['status'], Tone> = { PENDING: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'danger' };

/**
 * CONSOLIDAÇÃO DE PAGAMENTOS — a tela (v1.126.0).
 *
 * Os filtros moram na URL: o servidor recalcula e o link que a Supervisão
 * manda abre igual. Ordenação e a troca Por lançamento / Por colaborador são
 * só de exibição, ficam aqui. Nenhum botão desta tela grava nada.
 */
export function ConsolidacaoPagamentosClient({ dados, filtro }: { dados: Consolidacao; filtro: FiltroConsolidacao }) {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>('lancamento');
  const [ordem, setOrdem] = useState<Ordem>('data');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [de, setDe] = useState(filtro.de ?? dados.periodo.de);
  const [ate, setAte] = useState(filtro.ate ?? dados.periodo.ate);
  const [aberto, setAberto] = useState<string | null>(null);

  const ir = (mudar: Partial<FiltroConsolidacao>) => {
    const novo: FiltroConsolidacao = { ...filtro, ...mudar };
    router.push(`${BASE}?${queryDoFiltro(novo)}`);
  };
  const q = queryDoFiltro(filtro);
  const r = dados.resumo;

  const linhas = useMemo(() => ordenar(dados.lancamentos, ordem, dir), [dados.lancamentos, ordem, dir]);
  const ordenarPor = (o: Ordem) => {
    if (o === ordem) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setOrdem(o); setDir('asc'); }
  };

  return (
    <div className="space-y-4">
      {/* ── Período ── */}
      <section className="space-y-2" aria-label="Período">
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS_RAPIDOS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={filtro.periodo === p.value}
              onClick={() => (p.value === 'personalizado' ? ir({ periodo: 'personalizado', de, ate }) : ir({ periodo: p.value as PeriodoRapido, de: undefined, ate: undefined }))}
              className={filtro.periodo === p.value
                ? 'rounded-control bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand'
                : 'rounded-control border border-line px-3 py-1.5 text-sm font-semibold text-ink-700 hover:border-brand'}
            >
              {p.label}
            </button>
          ))}
        </div>
        {filtro.periodo === 'personalizado' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44"><DatePicker label="Data inicial" value={de || null} onValueChange={(v) => setDe(v ?? '')} /></div>
            <div className="w-44"><DatePicker label="Data final" value={ate || null} onValueChange={(v) => setAte(v ?? '')} /></div>
            <button type="button" onClick={() => ir({ periodo: 'personalizado', de: de || undefined, ate: ate || undefined })} className="h-10 rounded-control bg-brand px-3 text-sm font-semibold text-on-brand">Aplicar</button>
          </div>
        )}
        <p className="text-sm text-ink-700">Período: <b>{dados.periodo.rotulo}</b> · pela <b>data do serviço</b> (dia da hora extra ou do freelancer), não pela data em que a solicitação foi criada.</p>
      </section>

      {/* ── Demais filtros ── */}
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filtros">
        <Select
          label="Unidade"
          value={filtro.unitId ?? ''}
          onValueChange={(v) => ir({ unitId: v || undefined, pessoa: undefined })}
          options={[{ value: '', label: 'Todas as unidades' }, ...dados.unidades.map((u) => ({ value: u.id, label: u.name }))]}
        />
        <Select label="Tipo" value={filtro.tipo} onValueChange={(v) => ir({ tipo: v as FiltroConsolidacao['tipo'], pessoa: undefined })} options={TIPOS_CONS} />
        <Select label="Status" value={filtro.status} onValueChange={(v) => ir({ status: v as FiltroConsolidacao['status'] })} options={STATUS_CONS} />
        <Select
          label="Colaborador"
          searchable
          searchPlaceholder="Pesquisar colaborador…"
          value={filtro.pessoa ?? ''}
          onValueChange={(v) => ir({ pessoa: v || undefined })}
          options={[{ value: '', label: 'Todos' }, ...dados.pessoas]}
        />
      </section>

      {/* ── Exportar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/payments/consolidacao/export?${q}`} className="inline-flex h-10 items-center gap-1.5 rounded-control bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover">
          <Download className="h-4 w-4" /> Exportar Excel
        </a>
        <a href={`${BASE}/relatorio?${q}&imprimir=1`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-control border border-line-strong px-3 text-sm font-semibold text-ink-900 hover:border-brand">
          <FileText className="h-4 w-4" /> Gerar PDF
        </a>
        <p className="text-xs text-ink-500">Exportar ou gerar o PDF <b>não</b> marca nada como pago — o pagamento continua na aba Pagar.</p>
      </div>

      {/* ── Resumo financeiro ── */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5" aria-label="Resumo do período">
        <StatCard label="Solicitações" value={r.solicitacoes} />
        <StatCard label="Freelancers" value={r.freelancers} hint={formatBRL(r.valorFreelancer)} />
        <StatCard label="Horas extras" value={r.horasExtras} hint={formatBRL(r.valorHoraExtra)} />
        <StatCard label="Vale-transporte" value={formatBRL(r.vt)} hint="já incluído no total" />
        <StatCard label="Total do período" value={formatBRL(r.total)} className="col-span-2 lg:col-span-1" />
      </section>

      {r.fora.qtd > 0 && (
        <Banner tone="info" title={`${r.fora.qtd} rejeitada(s) fora dos totais`} description={`Aparecem riscadas na lista (${formatBRL(r.fora.valor)}), mas não somam. Para somá-las, filtre o status Rejeitado.`} />
      )}
      {filtro.status === 'TODOS' && r.pendentes.qtd > 0 && (
        <Banner tone="warning" title={`${r.pendentes.qtd} pendente(s) de aprovação dentro do total`} description={`${formatBRL(r.pendentes.valor)} ainda não foram aprovados. Para enviar ao Financeiro só o que está a pagar, filtre o status Aprovado.`} />
      )}

      {/* ── Por unidade: cada unidade no seu bloco ── */}
      {dados.porUnidade.length > 0 && (
        <section aria-label="Consolidado por unidade" className="space-y-2">
          <h2 className="sgo-type-15 font-semibold text-ink-900">Por unidade</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dados.porUnidade.map((u) => (
              <div key={u.unitId} className="rounded-card border border-line bg-surface p-3">
                <p className="sgo-type-13 mb-1 font-semibold text-brand">{u.unidade.toUpperCase()}</p>
                <dl className="space-y-0.5 text-sm">
                  <div className="flex justify-between"><dt className="text-ink-500">Freelancer</dt><dd className="tabular-nums">{formatBRL(u.freelancer)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-500">Hora Extra</dt><dd className="tabular-nums">{formatBRL(u.horaExtra)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-500">Vale-transporte (incluído)</dt><dd className="tabular-nums">{formatBRL(u.vt)}</dd></div>
                  <div className="flex justify-between border-t border-line pt-1 font-semibold text-ink-900"><dt>TOTAL</dt><dd className="tabular-nums">{formatBRL(u.total)}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Lista ── */}
      <section aria-label="Lançamentos" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sgo-type-15 font-semibold text-ink-900">{dados.lancamentos.length} lançamento(s)</h2>
          <SegmentedControl<Visao>
            aria-label="Visualização"
            size="sm"
            value={visao}
            onValueChange={setVisao}
            options={[{ value: 'lancamento', label: 'Por lançamento' }, { value: 'colaborador', label: 'Por colaborador' }]}
          />
        </div>

        {dados.lancamentos.length === 0 ? (
          <p className="rounded-card border border-dashed border-line p-4 text-sm text-ink-500">Nenhum Freelancer ou Hora Extra com esses filtros no período.</p>
        ) : visao === 'lancamento' ? (
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-canvas text-left text-xs text-ink-500">
                <tr>
                  <Th o="data" rotulo="Data" atual={ordem} dir={dir} onClick={ordenarPor} />
                  <Th o="unidade" rotulo="Unidade" atual={ordem} dir={dir} onClick={ordenarPor} />
                  <Th o="tipo" rotulo="Tipo" atual={ordem} dir={dir} onClick={ordenarPor} />
                  <Th o="colaborador" rotulo="Colaborador" atual={ordem} dir={dir} onClick={ordenarPor} />
                  <th className="px-2 py-2 text-right font-semibold">Horas</th>
                  <th className="px-2 py-2 text-right font-semibold">V.T.</th>
                  <th className="px-2 py-2 text-right font-semibold">Valor</th>
                  <Th o="status" rotulo="Status" atual={ordem} dir={dir} onClick={ordenarPor} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {linhas.map((l) => <LinhaDoLancamento key={l.id} l={l} somando={entraNosTotais(l, filtro.status)} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-canvas text-left text-xs text-ink-500">
                <tr>
                  <th className="px-2 py-2 font-semibold">Colaborador</th>
                  <th className="px-2 py-2 text-right font-semibold">Hora Extra</th>
                  <th className="px-2 py-2 text-right font-semibold">Freelancer</th>
                  <th className="px-2 py-2 text-right font-semibold">V.T.</th>
                  <th className="px-2 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dados.porColaborador.map((p) => (
                  <PessoaComLancamentos key={p.chave} p={p} aberto={aberto === p.chave} alternar={() => setAberto(aberto === p.chave ? null : p.chave)} status={filtro.status} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-500">Valor = o valor da solicitação, o mesmo pago na aba Pagar; o vale-transporte lançado já está dentro dele. Cada lançamento é uma linha — o mesmo colaborador em dias diferentes não é fundido.</p>
      </section>
    </div>
  );
}

function Th({ o, rotulo, atual, dir, onClick }: { o: Ordem; rotulo: string; atual: Ordem; dir: 'asc' | 'desc'; onClick: (o: Ordem) => void }) {
  const Icone = atual !== o ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className="px-2 py-2 font-semibold" aria-sort={atual === o ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => onClick(o)} className="inline-flex items-center gap-1 hover:text-ink-900">
        {rotulo} <Icone className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );
}

function LinhaDoLancamento({ l, somando, recuo = false }: { l: Lancamento; somando: boolean; recuo?: boolean }) {
  return (
    <tr className={somando ? '' : 'text-ink-400'}>
      <td className={`whitespace-nowrap px-2 py-1.5 tabular-nums ${recuo ? 'pl-8' : ''}`}>{emBR(l.data)}</td>
      <td className="px-2 py-1.5">{l.unidade}</td>
      <td className="px-2 py-1.5">{TIPO_TEXTO[l.tipo]}</td>
      <td className="px-2 py-1.5">
        <span className="font-medium text-ink-900">{l.pessoa}</span>
        {l.semVinculoRh && <span className="ml-1 text-xs text-warning" title="Lançada antes do vínculo com o RH: nome digitado">(nome digitado)</span>}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{textoHoras(l.horas)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(l.vt)}</td>
      <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${somando ? 'text-ink-900' : 'line-through'}`}>{formatBRL(l.valor)}</td>
      <td className="px-2 py-1.5"><StatusBadge tone={TOM_STATUS[l.status]}>{STATUS_TEXTO[l.status]}</StatusBadge></td>
    </tr>
  );
}

function PessoaComLancamentos({ p, aberto, alternar, status }: { p: Consolidacao['porColaborador'][number]; aberto: boolean; alternar: () => void; status: FiltroConsolidacao['status'] }) {
  const Seta = aberto ? ChevronDown : ChevronRight;
  return (
    <>
      <tr className="cursor-pointer hover:bg-canvas" onClick={alternar}>
        <td className="px-2 py-1.5">
          <button type="button" aria-expanded={aberto} className="inline-flex items-center gap-1 text-left font-medium text-ink-900">
            <Seta className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            {p.pessoa}
            <span className="text-xs font-normal text-ink-500">· {p.lancamentos.length} lanç. · {p.unidades.join(', ')}</span>
          </button>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(p.horaExtra)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(p.freelancer)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(p.vt)}</td>
        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ink-900">{formatBRL(p.total)}</td>
      </tr>
      {aberto && (
        <tr>
          <td colSpan={5} className="bg-canvas px-2 py-2">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {p.lancamentos.map((l) => <LinhaDoLancamento key={l.id} l={l} somando={entraNosTotais(l, status)} recuo />)}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
