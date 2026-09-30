'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Plus, Wallet, HandCoins, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input, Textarea, CurrencyField } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { PeriodPicker } from '@/components/ui/ds/period-picker';
import { Sheet } from '@/components/ui/ds/sheet';
import { StatCard } from '@/components/ui/ds/stat-card';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { Banner } from '@/components/ui/ds/banner';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { formatBRL } from '@/lib/utils';
import { formatBr } from '@/lib/ds/date';
import { shortUnitName } from '@/lib/unit-name';
import { CATEGORIAS, CATEGORIA_LABEL, DESCRICAO_MAX, STATUS, STATUS_LABEL, STATUS_TONE, type CategoriaDespesa, type StatusDespesa } from '@/lib/expenses/tipos';

/**
 * DESPESAS — retiradas do COFRE.
 *
 * O formulário não tem "origem do dinheiro" e não pergunta "foi do cofre?":
 * toda despesa aqui É uma retirada do cofre, por definição. Oferecer "Caixa"
 * numa lista seria o SGO abrindo um procedimento que a operação não autoriza.
 *
 * Feito para o celular: Data → Valor → Categoria → Descrição → Foto (opcional,
 * câmera) → Salvar. Sem tela intermediária.
 */

export interface DespesaUI {
  id: string;
  unitId: string;
  unidade: string;
  expenseDate: string;
  amount: number;
  category: CategoriaDespesa;
  description: string;
  receiptPath: string | null;
  status: StatusDespesa;
  createdByName: string;
  createdAt: string;
  refundedAt: string | null;
  refundedByName: string | null;
  refundedAmount: number | null;
}

export function ExpensesClient({ linhas, resumo, units, unidadeSelecionada, filtros, podeLancar, podeDevolver, visaoRede, hoje }: {
  linhas: DespesaUI[];
  resumo: { total: number; pendente: number; devolvido: number; qtdPendente: number; qtd: number };
  units: { id: string; name: string }[];
  /** A unidade do seletor do cabeçalho; nula em "Toda a Rede". */
  unidadeSelecionada: string | null;
  filtros: { start: string; end: string; categoria: string; status: string };
  podeLancar: boolean;
  podeDevolver: boolean;
  visaoRede: boolean;
  hoje: string;
}) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [aberta, setAberta] = useState<DespesaUI | null>(null);
  const [aviso, setAviso] = useState<{ tone: 'success' | 'danger'; title: string; description?: string } | null>(null);

  const extra = { categoria: filtros.categoria, status: filtros.status };
  function irCom(mudanca: Partial<typeof extra>) {
    const p = new URLSearchParams({ start: filtros.start, end: filtros.end });
    for (const [k, v] of Object.entries({ ...extra, ...mudanca })) if (v) p.set(k, v);
    router.push(`/modulos/despesas?${p.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodPicker start={filtros.start} end={filtros.end} basePath="/modulos/despesas" extra={extra} />
        {podeLancar && (
          <Button size="sm" onClick={() => { setAviso(null); setNovo(true); }}>
            <Plus className="h-4 w-4" /> Nova despesa
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatCard label="Total de despesas" value={formatBRL(resumo.total)} hint={`${resumo.qtd} despesa(s) no período`} icon={Wallet} />
        {/* Pendente em destaque: é dinheiro que saiu do cofre e ainda não voltou. */}
        <StatCard label="Pendente de devolução" value={formatBRL(resumo.pendente)} hint={`${resumo.qtdPendente} a recompor`} tone={resumo.pendente > 0 ? 'warning' : 'default'} icon={HandCoins} />
        <StatCard label="Devolvido" value={formatBRL(resumo.devolvido)} tone={resumo.devolvido > 0 ? 'success' : 'default'} icon={Receipt} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-52">
          <Select label="Categoria" size="sm" value={filtros.categoria} onValueChange={(v) => irCom({ categoria: v })}
            options={[{ value: '', label: 'Todas as categorias' }, ...CATEGORIAS.map((c) => ({ value: c.value, label: c.label }))]} />
        </div>
        <div className="w-52">
          <Select label="Situação" size="sm" value={filtros.status} onValueChange={(v) => irCom({ status: v })}
            options={[{ value: '', label: 'Todas' }, ...STATUS.filter((s) => s.value !== 'CANCELED').map((s) => ({ value: s.value, label: s.label }))]} />
        </div>
      </div>

      {aviso && <Banner tone={aviso.tone} title={aviso.title} description={aviso.description} onDismiss={() => setAviso(null)} />}

      {linhas.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma despesa no período" description={podeLancar ? 'Retirou dinheiro do cofre para uma despesa da unidade? Registre em "Nova despesa".' : 'Nada lançado pelas unidades neste período.'} size="sm" />
      ) : (
        <List>
          {linhas.map((d) => (
            <ListRow
              key={d.id}
              onClick={() => setAberta(d)}
              title={d.description}
              subtitle={[
                formatBr(d.expenseDate),
                CATEGORIA_LABEL[d.category],
                visaoRede ? shortUnitName(d.unidade) : null,
                visaoRede ? `por ${d.createdByName}` : null,
                d.receiptPath ? 'com comprovante' : null,
              ].filter(Boolean).join(' · ')}
              trailing={
                <>
                  <span className="sgo-type-15 font-semibold tabular-nums text-ink-900">{formatBRL(d.amount)}</span>
                  <StatusBadge tone={STATUS_TONE[d.status]} dot>{STATUS_LABEL[d.status]}</StatusBadge>
                </>
              }
            />
          ))}
        </List>
      )}

      <NovaDespesa
        open={novo}
        onClose={() => setNovo(false)}
        units={units}
        unidadeInicial={unidadeSelecionada ?? (units.length === 1 ? units[0].id : '')}
        hoje={hoje}
        onSalvou={() => {
          setNovo(false);
          setAviso({ tone: 'success', title: 'Despesa registrada com sucesso.', description: 'Aguardando devolução do escritório.' });
          router.refresh();
        }}
      />

      <Detalhe
        despesa={aberta}
        onClose={() => setAberta(null)}
        podeDevolver={podeDevolver}
        onDevolveu={() => {
          setAberta(null);
          setAviso({ tone: 'success', title: 'Devolução registrada.', description: 'O valor voltou ao cofre da unidade e o responsável foi avisado.' });
          router.refresh();
        }}
      />
    </div>
  );
}

/* ─────────────────────────── Nova despesa ─────────────────────────── */

function NovaDespesa({ open, onClose, units, unidadeInicial, hoje, onSalvou }: {
  open: boolean; onClose: () => void; units: { id: string; name: string }[]; unidadeInicial: string; hoje: string; onSalvou: () => void;
}) {
  const [unitId, setUnitId] = useState(unidadeInicial);
  const [data, setData] = useState<string | null>(hoje);
  const [valor, setValor] = useState<number | null>(null);
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');

  const unidade = unitId || unidadeInicial;

  async function salvar() {
    setErro('');
    if (!unidade) { setErro('Escolha a unidade.'); return; }
    if (!valor || valor <= 0) { setErro('Informe o valor.'); return; }
    if (!categoria) { setErro('Escolha a categoria.'); return; }
    if (!descricao.trim()) { setErro('Descreva o motivo da despesa.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('unitId', unidade);
      fd.set('expenseDate', data ?? '');
      fd.set('amount', String(valor));
      fd.set('category', categoria);
      fd.set('description', descricao.trim());
      const f = arquivo.current?.files?.[0];
      if (f) fd.set('receipt', f);
      const r = await fetch('/api/expenses', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error ?? 'Não foi possível registrar.'); return; }
      setValor(null); setCategoria(''); setDescricao(''); setData(hoje); setNomeArquivo('');
      if (arquivo.current) arquivo.current.value = '';
      onSalvou();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nova despesa"
      description="Dinheiro retirado do cofre da unidade. O escritório devolve depois."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={salvar} loading={busy}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {units.length > 1 && (
          <Select label="Unidade" required value={unidade} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: u.name }))} placeholder="Escolha a unidade" />
        )}
        <DatePicker label="Data da despesa" required value={data} onValueChange={setData} max={hoje} hint="Hoje por padrão; ajuste se a despesa foi em outro dia." />
        <CurrencyField label="Valor (R$)" required value={valor} onValueChange={setValor} />
        <Select label="Categoria" required value={categoria} onValueChange={setCategoria} placeholder="Escolha…" options={CATEGORIAS.map((c) => ({ value: c.value, label: c.label }))} />
        <Textarea label="Descrição / motivo" required value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={DESCRICAO_MAX} placeholder='ex.: "Compra emergencial de registro para banheiro"' rows={2} />
        <div>
          <p className="mb-1 text-xs font-medium text-ink-700">Comprovante (opcional)</p>
          {/* `capture` abre a câmera no celular; no computador é o seletor de arquivo. */}
          <input ref={arquivo} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" id="despesa-comprovante" onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? '')} />
          <label htmlFor="despesa-comprovante" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink-900 hover:border-brand">
            <Camera className="h-4 w-4" /> {nomeArquivo ? 'Trocar foto' : 'Tirar foto / anexar'}
          </label>
          {nomeArquivo && <p className="mt-1 truncate sgo-type-11 text-ink-500">{nomeArquivo}</p>}
        </div>
        {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
      </div>
    </Sheet>
  );
}

/* ──────────────────────────── Detalhe ──────────────────────────── */

function Detalhe({ despesa, onClose, podeDevolver, onDevolveu }: {
  despesa: DespesaUI | null; onClose: () => void; podeDevolver: boolean; onDevolveu: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const d = despesa;

  async function devolver() {
    if (!d) return;
    if (!confirm(`Registrar a devolução de ${formatBRL(d.amount)} ao cofre de ${d.unidade}?\n\nA despesa passa a "Devolvida", com você como responsável pela baixa.`)) return;
    setBusy(true); setErro('');
    try {
      const r = await fetch(`/api/expenses/${d.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refund' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? 'Não foi possível registrar.'); return; }
      onDevolveu();
    } finally {
      setBusy(false);
    }
  }

  const linhas: [string, string][] = d ? [
    ['Data da despesa', formatBr(d.expenseDate)],
    ['Valor', formatBRL(d.amount)],
    ['Categoria', CATEGORIA_LABEL[d.category]],
    ['Unidade', d.unidade],
    ['Origem', 'Cofre da unidade'],
    ['Lançada por', `${d.createdByName} em ${new Date(d.createdAt).toLocaleString('pt-BR')}`],
    ...(d.refundedAt ? [['Devolvida por', `${d.refundedByName ?? '—'} em ${new Date(d.refundedAt).toLocaleString('pt-BR')}${d.refundedAmount != null ? ` · ${formatBRL(d.refundedAmount)}` : ''}`] as [string, string]] : []),
  ] : [];

  return (
    <Sheet
      open={!!d}
      onClose={onClose}
      title={d?.description ?? ''}
      description={d ? `${formatBRL(d.amount)} · ${STATUS_LABEL[d.status]}` : undefined}
      footer={d && podeDevolver && d.status === 'PENDING_REFUND' ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={devolver} loading={busy}><HandCoins className="h-4 w-4" /> Registrar devolução</Button>
        </div>
      ) : undefined}
    >
      {d && (
        <div className="space-y-3">
          <StatusBadge tone={STATUS_TONE[d.status]} dot>{STATUS_LABEL[d.status]}</StatusBadge>
          <div className="space-y-1 rounded-lg bg-canvas p-2">
            {linhas.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-xs">
                <span className="shrink-0 text-ink-500">{k}</span>
                <span className="text-right font-medium text-ink-900">{v}</span>
              </div>
            ))}
          </div>
          {d.receiptPath ? (
            /^\/?uploads\/.*\.pdf$/i.test(d.receiptPath)
              ? <a href={`/${d.receiptPath}`} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-brand underline">Abrir comprovante (PDF)</a>
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={`/${d.receiptPath}`} alt="Comprovante da despesa" className="max-h-80 w-full rounded-lg border border-line object-contain" />
          ) : (
            <p className="text-sm text-ink-500">Sem comprovante anexado.</p>
          )}
          {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
        </div>
      )}
    </Sheet>
  );
}
