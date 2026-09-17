'use client';

import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StatCard } from '@/components/ui/ds/stat-card';
import { useRouter } from 'next/navigation';
import { Save, Droplets, Pencil, Camera, Check, ImageOff, Maximize2, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { Input } from '@/components/ui/ds/field';
import { Banner } from '@/components/ui/ds/banner';
import { Modal, useBodyPortal, useDialogBehavior } from '@/components/ui/ds/modal';
import { Table } from '@/components/ui/ds/table';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { InlineDateEdit } from '@/components/shared/inline-date-edit';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { formatBr, todayISO } from '@/lib/ds/date';
import { formatBRL } from '@/lib/utils';
// Apelido: este arquivo ja tem uma `interface Group` (agrupamento de dados do
// dashboard). Sem o alias, o mesmo nome ficaria em dois papeis no mesmo escopo.
import { Group as ListGroup } from '@/components/ui/ds/group';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string }
interface Group { key: string; name: string; liters: number; total: number }
interface MonthPoint { month: string; liters: number; total: number }
export interface OilDash { totalLiters: number; totalValue: number; avgPricePerLiter: number; byUnit: Group[]; byMethod: Group[]; monthly: MonthPoint[] }
export interface OilRow {
  id: string; date: string; unit: string; supplier: string; collector: string;
  liters: number; price: number; total: number; method: string; observation: string;
  /** Responsável pelo LANÇAMENTO (quem digitou) e quando digitou. */
  by: string; at: string;
  /** Caminho da foto do recibo. `null` nas coletas anteriores à regra. */
  receipt: string | null;
  dateEdited?: boolean; dateEditedByName?: string | null;
}

const METHODS = ['PIX', 'Dinheiro', 'Crédito em conta', 'Transferência', 'Troca por produto'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mlabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTHS[Number(mm) - 1]}/${y.slice(2)}`; };
const perL = (n: number) => `R$ ${n.toFixed(4).replace('.', ',')}/L`;
const litros = (n: number) => `${n.toLocaleString('pt-BR')} L`;
/** Data e hora do lançamento, no fuso de quem está lendo. */
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const JANELAS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 6 meses' },
  { value: '365', label: 'Último ano' },
  { value: '0', label: 'Todo o histórico' },
];

export function OilClient({ canLaunch, isAdmin, canEditDate = false, meuNome, dias, units, suppliers, dashboard, rows, abas = {} }: {
  canLaunch: boolean; isAdmin: boolean; canEditDate?: boolean;
  /** Nome de quem está logado — vira o "Responsável pelo lançamento". */
  meuNome: string;
  /** Janela do histórico que o servidor carregou (vem da URL). */
  dias: number;
  units: Unit[]; suppliers: Supplier[]; dashboard: OilDash; rows: OilRow[];

  /** Abas liberadas para o perfil (Configurações → Perfis de acesso). */
  abas?: AcessoAbas;
}) {
  const [tab, setTab] = useState<'lancar' | 'painel' | 'historico'>(abaInicial(abas, 'OIL', canLaunch ? 'lancar' : 'painel') as 'lancar' | 'painel' | 'historico');
  const tabs: { key: typeof tab; label: string; show: boolean }[] = [
    { key: 'lancar', label: 'Lançar coleta', show: canLaunch },
    { key: 'painel', label: 'Dashboard', show: true },
    { key: 'historico', label: 'Histórico', show: true },
  ];
  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="Seções de Coleta de Óleo"
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        options={tabs.filter((t) => t.show && podeAba(abas, t.key)).map((t) => ({ value: t.key, label: t.label }))}
      />
      {tab === 'lancar' && canLaunch && <Launch units={units} suppliers={suppliers} meuNome={meuNome} />}
      {tab === 'painel' && <Dashboard d={dashboard} />}
      {tab === 'historico' && <History rows={rows} dias={dias} isAdmin={isAdmin} canEditDate={canEditDate} />}
    </div>
  );
}

function Launch({ units, suppliers, meuNome }: { units: Unit[]; suppliers: Supplier[]; meuNome: string }) {
  const router = useRouter();
  const hoje = todayISO();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [date, setDate] = useState<string | null>(hoje);
  const [supplierId, setSupplierId] = useState('');
  const [collector, setCollector] = useState('');
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState('');
  const [method, setMethod] = useState('');
  const [obs, setObs] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const l = parseFloat((liters || '0').replace(',', '.'));
  const p = parseFloat((price || '0').replace(',', '.'));
  const total = l > 0 && p > 0 ? l * p : 0;
  /* O nome digitado só é cobrado quando NÃO há fornecedor escolhido — a
     empresa coletora costuma estar no cadastro, e quem é do cadastro já tem
     nome. */
  const temColetor = Boolean(supplierId || collector.trim());

  async function submit() {
    setErr(null); setOk(null);
    if (!unitId || !date) { setErr('Informe a unidade e a data da coleta.'); return; }
    if (!(l > 0)) { setErr('Informe os litros coletados.'); return; }
    if (!temColetor) { setErr('Informe a empresa ou o responsável pela coleta.'); return; }
    if (!file) { setErr('Anexe a foto do recibo da coleta.'); fileRef.current?.click(); return; }

    setBusy(true);
    try {
      /* multipart: a foto vai no mesmo request do lançamento. Gravar primeiro e
         anexar depois abriria a janela em que existe coleta sem comprovante —
         exatamente o que esta tela passou a impedir. */
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('operationalDate', date);
      fd.append('supplierId', supplierId);
      fd.append('collectorName', collector.trim());
      fd.append('liters', String(l));
      fd.append('pricePerLiter', String(p > 0 ? p : 0));
      fd.append('paymentMethod', method);
      fd.append('observation', obs);
      fd.append('receipt', file);

      const res = await fetch('/api/oil', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      setOk(`Coleta registrada: ${litros(l)}${data.totalValue > 0 ? ` · ${formatBRL(data.totalValue)} a receber` : ''}. Comprovante anexado.`);
      setLiters(''); setPrice(''); setMethod(''); setCollector(''); setObs(''); setSupplierId(''); setFile(null); setDate(hoje);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <Select label="Unidade" required value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
      )}
      <DatePicker
        label="Data da coleta" required value={date} onValueChange={setDate} max={hoje}
        hint="O dia em que o óleo saiu da unidade — não precisa ser hoje."
      />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Litros coletados" required inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="ex: 80" />
        <Input label="Valor por litro (R$)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
      </div>
      {total > 0 && (
        <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-3 text-center">
          <p className="text-xs text-ink-500">Valor total a receber</p>
          <p className="sgo-type-24 font-semibold text-ink-900">{formatBRL(total)}</p>
        </div>
      )}
      <Select
        label="Empresa coletora (do cadastro)" value={supplierId} onValueChange={setSupplierId}
        options={[{ value: '', label: '— não cadastrada —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
      />
      {!supplierId && (
        <Input
          label="Empresa ou responsável pela coleta" required value={collector} onChange={(e) => setCollector(e.target.value)}
          placeholder="Quem levou o óleo"
          hint="Obrigatório quando a empresa não está no cadastro de fornecedores."
        />
      )}
      <Select
        label="Como recebemos" value={method} onValueChange={setMethod}
        options={[{ value: '', label: '— não informado —' }, ...METHODS.map((m) => ({ value: m, label: m }))]}
      />

      {/* Comprovante — o campo que trava o lançamento. Fica logo acima do botão
          de salvar porque é o passo que as pessoas esquecem. */}
      <div className="rounded-lg border-2 border-line-strong bg-sunken p-3">
        <p className="text-sm font-semibold text-ink-900">Foto do recibo da coleta <span className="text-danger">*</span></p>
        <p className="mt-0.5 text-xs text-ink-500">Obrigatória: é o que permite conferir os litros depois.</p>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            {file ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />} {file ? 'Trocar foto' : 'Anexar / tirar foto'}
          </Button>
          {file && <span className="min-w-0 truncate text-xs text-ink-500">{file.name}</span>}
        </div>
      </div>

      <Input label="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />

      {/* Responsável pelo lançamento: texto, não campo. Não há o que alterar. */}
      <p className="text-xs text-ink-500">
        Responsável pelo lançamento: <b className="text-ink-900">{meuNome}</b> — preenchido pelo sistema junto com a data e a hora do envio.
      </p>

      {err && <Banner tone="danger" title={err} />}
      {ok && <Banner tone="success" title={ok} />}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full">
        {file ? <><Save className="h-5 w-5" /> Registrar coleta</> : <><Camera className="h-5 w-5" /> Anexar o recibo para registrar</>}
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(null); e.target.value = ''; }}
      />
    </div>
  );
}

function Dashboard({ d }: { d: OilDash }) {
  if (d.totalLiters === 0) return <p className="text-sm text-ink-500">Ainda não há coletas no período.</p>;
  const maxU = Math.max(...d.byUnit.map((u) => u.total), 1);
  const maxM = Math.max(...d.monthly.map((m) => m.total), 1);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cell label="Litros (6m)" value={d.totalLiters.toLocaleString('pt-BR')} />
        <Cell label="Médio/litro" value={perL(d.avgPricePerLiter)} />
        <Cell label="Recebido (6m)" value={formatBRL(d.totalValue)} className="col-span-2 sm:col-span-1" />
      </div>
      <div>
        <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">Por unidade</h2>
        <div className="space-y-2">
          {d.byUnit.map((u) => (
            <div key={u.key} className="rounded-lg border bg-surface p-2.5">
              <div className="flex items-center justify-between text-sm"><span className="font-semibold text-ink-900">{u.name}</span><span className="font-bold">{formatBRL(u.total)}</span></div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${(u.total / maxU) * 100}%` }} /></div>
              <p className="mt-1 text-xs text-ink-500">{litros(u.liters)} · {perL(u.liters > 0 ? u.total / u.liters : 0)}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">Como recebemos</h2>
        <div className="space-y-1">
          {d.byMethod.map((m) => (
            <div key={m.key} className="flex items-center justify-between rounded-lg border bg-surface px-3 py-1.5 text-sm">
              <span>{m.name}</span><span className="font-semibold">{formatBRL(m.total)} <span className="text-xs font-normal text-ink-500">· {litros(m.liters)}</span></span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-1 sgo-type-11 font-semibold text-ink-900">Tendência mensal (R$ recebido)</h2>
        <div className="flex items-end gap-2 rounded-lg border bg-surface p-3" style={{ height: 140 }}>
          {d.monthly.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-semibold text-ink-900">{Math.round(m.total)}</span>
              <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (m.total / maxM) * 90)}px` }} />
              <span className="text-[10px] text-ink-500">{mlabel(m.month)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return <StatCard label={label} value={value} className={className} />;
}

function History({ rows, dias, isAdmin, canEditDate = false }: { rows: OilRow[]; dias: number; isAdmin: boolean; canEditDate?: boolean }) {
  const router = useRouter();
  const [unit, setUnit] = useState('');
  const [by, setBy] = useState('');
  const [aberta, setAberta] = useState<OilRow | null>(null);

  const unitNames = useMemo(() => [...new Set(rows.map((r) => r.unit))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const byNames = useMemo(() => [...new Set(rows.map((r) => r.by).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const shown = useMemo(
    () => rows.filter((r) => (!unit || r.unit === unit) && (!by || r.by === by)),
    [rows, unit, by],
  );
  const ativos = (unit ? 1 : 0) + (by ? 1 : 0);

  /* O período recarrega a página porque é ele que decide o que vem do banco. */
  const trocarPeriodo = (v: string) => router.push(`/modulos/oleo?dias=${v}`);

  return (
    <div className="space-y-3">
      <FilterBar
        onClear={ativos > 0 ? () => { setUnit(''); setBy(''); } : undefined}
        active={ativos}
        result={<span>{shown.length} coleta(s) · {litros(shown.reduce((s, r) => s + r.liters, 0))}</span>}
      >
        <FilterSelect label="Período" value={String(dias)} onValueChange={trocarPeriodo} options={JANELAS} />
        <FilterSelect
          label="Unidade" value={unit} onValueChange={setUnit}
          options={[{ value: '', label: 'Todas' }, ...unitNames.map((u) => ({ value: u, label: shortUnitName(u) }))]}
        />
        <FilterSelect
          label="Responsável pelo lançamento" value={by} onValueChange={setBy}
          options={[{ value: '', label: 'Todos' }, ...byNames.map((n) => ({ value: n, label: n }))]}
        />
      </FilterBar>

      <Table
        caption="Coletas de óleo registradas"
        rows={shown}
        getRowKey={(r) => r.id}
        onRowClick={(r) => setAberta(r)}
        empty={<EmptyState icon={Droplets} title="Nenhuma coleta no período" description="Amplie o período ou limpe os filtros." />}
        columns={[
          { key: 'data', header: 'Data', width: '7rem', cell: (r) => formatBr(r.date) },
          /* A coluna da unidade só existe para quem enxerga mais de uma. Para o
             gerente ela repetiria o mesmo nome em todas as linhas e roubaria,
             no celular, a largura da coluna do comprovante — que é o que se
             veio conferir. */
          ...(unitNames.length > 1 ? [{ key: 'unidade', header: 'Unidade', cell: (r: OilRow) => shortUnitName(r.unit) }] : []),
          { key: 'litros', header: 'Litros', numeric: true, width: '7rem', cell: (r) => litros(r.liters) },
          { key: 'resp', header: 'Responsável', hideOnMobile: true, cell: (r) => r.by || null },
          {
            key: 'comp',
            header: 'Comprovante',
            width: '9rem',
            cell: (r) => (r.receipt
              ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><Check className="h-4 w-4" /> Conferir</span>
              /* Coleta anterior à regra do comprovante: dizer isso é melhor do
                 que um traço, que pareceria dado faltando por engano. */
              : <span className="inline-flex items-center gap-1 text-sm text-ink-500"><ImageOff className="h-4 w-4" /> Sem foto</span>),
          },
        ]}
      />

      {aberta && (
        <Conferencia
          r={aberta}
          isAdmin={isAdmin}
          canEditDate={canEditDate}
          onClose={() => setAberta(null)}
        />
      )}
    </div>
  );
}

/**
 * Conferência — o número lançado e o papel, lado a lado.
 *
 * A pergunta que esta tela responde é uma só: "o recibo diz o mesmo que o
 * sistema?". Por isso os dois ficam na MESMA visão, e não em duas telas com um
 * clique no meio: divergência que exige memória entre um clique e outro é
 * divergência que não se acha.
 */
function Conferencia({ r, isAdmin, canEditDate, onClose }: { r: OilRow; isAdmin: boolean; canEditDate: boolean; onClose: () => void }) {
  const [ampliada, setAmpliada] = useState(false);
  const [editandoData, setEditandoData] = useState(false);
  const src = r.receipt ? `/${r.receipt}` : null;

  return (
    <>
      <Modal open onClose={onClose} size="lg" title={`Coleta de ${formatBr(r.date)}`} description={`${r.unit} · ${litros(r.liters)}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="space-y-1">
            <h3 className="sgo-type-11 font-semibold text-ink-900">Lançado no SGO</h3>
            <ListGroup>
              <Linha rotulo="Unidade" valor={r.unit} />
              <Linha rotulo="Data da coleta" valor={formatBr(r.date)} />
              <Linha rotulo="Litros coletados" valor={litros(r.liters)} destaque />
              <Linha rotulo="Empresa/responsável pela coleta" valor={r.collector || '—'} />
              {r.price > 0 && <Linha rotulo="Valor" valor={`${formatBRL(r.total)} · ${perL(r.price)}`} />}
              {r.method && <Linha rotulo="Como recebemos" valor={r.method} />}
              {r.observation && <Linha rotulo="Observação" valor={r.observation} />}
              <Linha rotulo="Responsável pelo lançamento" valor={r.by || '—'} destaque />
              <Linha rotulo="Data/hora do lançamento" valor={quando(r.at)} />
            </ListGroup>
            {r.dateEdited && (
              <p className="text-xs font-semibold text-danger">
                Data corrigida{r.dateEditedByName ? ` por ${r.dateEditedByName}` : ''} — desconta na meta
              </p>
            )}
          </section>

          <section className="space-y-1">
            <h3 className="sgo-type-11 font-semibold text-ink-900">Comprovante</h3>
            {src ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setAmpliada(true)}
                  aria-label="Ampliar o comprovante"
                  className="block w-full overflow-hidden rounded-lg border border-line bg-sunken outline-none focus-visible:shadow-sgo-focus"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Recibo da coleta de ${formatBr(r.date)}`} className="max-h-80 w-full object-contain" />
                </button>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAmpliada(true)}><Maximize2 className="h-4 w-4" /> Ampliar</Button>
                  <a
                    href={src} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-semibold text-brand underline outline-none focus-visible:shadow-sgo-focus"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
                  </a>
                </div>
              </div>
            ) : (
              <Banner
                tone="warning"
                title="Esta coleta não tem comprovante"
                description="Foi lançada antes de a foto do recibo passar a ser obrigatória. Os lançamentos novos só fecham com a foto."
              />
            )}
          </section>
        </div>

        {(isAdmin || canEditDate) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            {canEditDate && <Button size="sm" variant="ghost" onClick={() => setEditandoData((v) => !v)}><Pencil className="h-4 w-4" /> Editar data</Button>}
            {isAdmin && <DeleteOpButton entity="oil" id={r.id} label={`a coleta de óleo (${formatBr(r.date)}, ${r.unit})`} />}
          </div>
        )}
        {editandoData && <InlineDateEdit module="oil" id={r.id} current={r.date} onClose={() => setEditandoData(false)} />}
      </Modal>

      {ampliada && src && <Ampliada src={src} alt={`Recibo da coleta de ${formatBr(r.date)}`} onClose={() => setAmpliada(false)} />}
    </>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    /* No celular o rótulo fica em cima: lado a lado, um rótulo longo espremia
       o valor em três linhas de uma palavra — justamente o campo que se veio
       comparar com o papel. */
    <div className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <span className="shrink-0 text-xs text-ink-500">{rotulo}</span>
      <span className={destaque ? 'text-sm font-semibold text-ink-900 sm:text-right' : 'text-sm text-ink-900 sm:text-right'}>{valor}</span>
    </div>
  );
}

/**
 * Recibo em tela cheia. Usa os mesmos hooks de diálogo do `Modal` (Esc fecha,
 * foco preso, fundo travado) sem a moldura dele: a moldura é justamente o que
 * rouba o espaço de onde se lê o número escrito à mão no papel.
 */
function Ampliada({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const show = useBodyPortal(true);
  useDialogBehavior(true, onClose, ref);
  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 p-4 print:hidden" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative mx-auto flex h-full max-w-5xl flex-col outline-none"
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="mb-2 flex h-10 w-10 items-center justify-center rounded-control bg-surface text-ink-900 outline-none hover:bg-sunken focus-visible:shadow-sgo-focus"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Rola nos dois eixos: recibo fotografado de perto passa da tela, e é
            de perto que se lê o número. */}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="mx-auto max-w-none" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
