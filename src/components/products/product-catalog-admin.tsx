'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Download, Trash2, Search, Sparkles, Pencil, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';
import { MutiraoDeSetores } from '@/components/products/mutirao-de-setores';
import { FichaDoProdutoSheet } from '@/components/products/ficha-do-produto';
import type { PendenciasDeCadastro } from '@/lib/products/pendencias';

interface Prod {
  id: string; name: string; origin: string; category: string; measure: string; active: boolean;
  /** Quantidade por embalagem (a coluna QUANT das listas de fornecedor). */
  packSize?: number | null;
  barcode?: string | null;
  /** Setor do CD — obrigatório para produto do CD, nulo para Fábrica. */
  cdSectorId?: string | null;
  cdSectorName?: string | null;
  /** 'PENDENTE' = criado pelo gerente no pedido, aguardando validação. */
  validation?: string;
  createdByName?: string | null;
  packType?: string;
  /** Todos os códigos (o principal incluído). */
  codigos?: string[];
  /** Códigos que entraram pelo pedido e ninguém do catálogo revisou. */
  codigosNovos?: number;
}
interface Setor { id: string; name: string }
const MEASURES = ['un', 'kg', 'cx', 'pct', 'L', 'dz'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Os cards da fila "Pendências de cadastro" — cada um é um filtro da lista. */
type Pendencia = 'novos' | 'codigos' | 'semSetor' | 'dups' | 'embalagem';

export function ProductCatalogAdmin({ products, setores = [], pendencias, filtroInicial }: {
  products: Prod[]; setores?: Setor[]; pendencias?: PendenciasDeCadastro;
  /** `?pendentes=1` no endereço (o link da notificação) abre já filtrado nos novos. */
  filtroInicial?: Pendencia | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [pendencia, setPendencia] = useState<Pendencia | null>(filtroInicial ?? null);
  /* Seleção para o LOTE e a ficha aberta. */
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [loteSetor, setLoteSetor] = useState<string | null>(null);
  const [loteOrigem, setLoteOrigem] = useState<string | null>(null);
  const [name, setName] = useState(''); const [origin, setOrigin] = useState('FABRICA'); const [category, setCategory] = useState(''); const [measure, setMeasure] = useState('un');
  const [pack, setPack] = useState(''); const [barcode, setBarcode] = useState('');
  const [novoSetor, setNovoSetor] = useState<string | null>(null);
  /* Filtro do mutirão: os produtos do CD que ainda não têm setor. São eles que
     caem em "Sem setor cadastrado" e somem da fila de todo separador. */
  const [soSemSetor, setSoSemSetor] = useState(false);
  /* Painel do mutirão: a lista inteira com o setor proposto, para confirmar de
     uma vez. Fechado por padrão — quem entra aqui nem sempre vem para isso. */
  const [mutirao, setMutirao] = useState(false);
  /* Origem da IMPORTAÇÃO, separada da origem do cadastro manual: uma planilha
     inteira costuma ser de um lado só, e misturar as duas confundiria. */
  const [importOrigin, setImportOrigin] = useState('FABRICA');

  async function post(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }
  async function importFile(file: File) {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      /* A lista do fornecedor não diz Fábrica ou CD — vai a escolha da tela. */
      fd.set('origin', importOrigin);
      const res = await fetch('/api/products/import', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Falha na importação'); return; }
      /* O resultado CONTA o que aconteceu: qual categoria veio do cabeçalho e
         que origem foi aplicada. Antes dizia só "0 criados" e a pessoa ficava
         sem saber se o arquivo estava errado ou se o sistema não entendeu. */
      const partes = [`${d.created} novo(s)`, `${d.updated} atualizado(s)`];
      if (d.ignored > 0) partes.push(`${d.ignored} linha(s) sem nome, ignorada(s)`);
      const extra = [
        d.categoryFromHeader ? `categoria "${d.categoryFromHeader}" (do cabeçalho)` : null,
        d.hadOriginColumn ? 'origem lida da planilha' : `origem: ${importOrigin === 'CD' ? 'CD' : 'Fábrica'}`,
      ].filter(Boolean).join(' · ');
      setMsg(`Importado: ${partes.join(', ')}. ${extra}`);
      router.refresh();
    } finally { setBusy(false); }
  }

  const semSetor = useMemo(() => products.filter((p) => p.origin === 'CD' && !p.cdSectorId), [products]);
  const emDuplicidade = useMemo(() => new Set(pendencias?.idsEmDuplicidade ?? []), [pendencias]);

  const filtered = useMemo(() => {
    const t = norm(q.trim());
    /* Busca por código de barras também: com 214 bebidas, achar pelo nome exato
       é mais lento do que bipar a garrafa. Vale para QUALQUER código do
       produto, não só o principal. */
    let base = soSemSetor ? semSetor : products;
    if (pendencia === 'novos') base = base.filter((p) => p.validation === 'PENDENTE');
    else if (pendencia === 'codigos') base = base.filter((p) => (p.codigosNovos ?? 0) > 0);
    else if (pendencia === 'semSetor') base = base.filter((p) => p.origin === 'CD' && !p.cdSectorId);
    else if (pendencia === 'dups') base = base.filter((p) => emDuplicidade.has(p.id));
    else if (pendencia === 'embalagem') base = base.filter((p) => p.packType && p.packType !== 'UN' && !(p.packSize && p.packSize > 1));
    return base.filter((p) => !t || norm(p.name).includes(t) || norm(p.category).includes(t) || (p.codigos ?? [p.barcode ?? '']).some((c) => c.includes(t)));
  }, [products, q, soSemSetor, semSetor, pendencia, emDuplicidade]);

  function alternar(id: string) {
    setSelecao((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function lote(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/products/ficha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lote', ids: [...selecao], ...body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Falha'); return; }
      /* O que não pôde é dito: "12 ignorados" são justamente os que precisam de atenção. */
      setMsg(`Lote: ${d.aplicados} aplicado(s)${d.ignorados ? `, ${d.ignorados} ignorado(s) — produto do CD validado não fica sem setor` : ''}.`);
      setSelecao(new Set());
      router.refresh();
    } finally { setBusy(false); }
  }

  const cards: { k: Pendencia; rotulo: string; n: number }[] = pendencias ? [
    { k: 'novos', rotulo: 'Produtos novos', n: pendencias.novos.length },
    { k: 'codigos', rotulo: 'Códigos novos', n: pendencias.codigosNovos.length },
    { k: 'semSetor', rotulo: 'Sem setor', n: pendencias.semSetor },
    { k: 'dups', rotulo: 'Possíveis duplicidades', n: pendencias.duplicidades.length },
    { k: 'embalagem', rotulo: 'Embalagem não definida', n: pendencias.embalagemIndefinida.length },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* A origem vem ANTES do botão: é escolha, não detalhe — e depois de
            escolher o arquivo o navegador já dispara a importação. */}
        <div className="w-40"><Select label="Origem da planilha" size="sm" value={importOrigin} onValueChange={setImportOrigin} options={[{ value: 'FABRICA', label: 'Fábrica' }, { value: 'CD', label: 'CD' }]} /></div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importar Excel</Button>
        <a href="/api/products/export" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand"><Download className="h-4 w-4" /> Exportar Excel (modelo)</a>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
      </div>
      <p className="text-xs text-ink-500">
        A planilha pode ser a <b>lista do fornecedor</b>: nomes na primeira coluna e, se o cabeçalho dela for o nome da
        categoria (ex.: <b>BEBIDAS</b>), a categoria vem de lá. Também são lidas as colunas <b>QUANT</b> (por embalagem),
        <b> UN</b> e <b>COD. BARRAS</b>. Colunas <i>Nome</i>, <i>Origem</i>, <i>Categoria</i> e <i>Medida</i>, quando
        existem, têm prioridade. Sem coluna de origem, vale a escolha ao lado.
      </p>
      {msg && <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium text-ink-900">{msg}</p>}

      {/* Novo produto */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
        <div className="flex-1 min-w-[8rem]"><label className="text-xs">Nome</label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" /></div>
        <div className="w-32"><Select label="Origem" size="sm" value={origin} onValueChange={setOrigin} options={[{ value: 'FABRICA', label: 'Fábrica' }, { value: 'CD', label: 'CD' }]} /></div>
        <div><label className="text-xs">Categoria</label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Geral" className="h-9 w-28 text-sm" /></div>
        <div className="w-24"><Select label="Medida" size="sm" value={measure} onValueChange={setMeasure} options={MEASURES.map((m) => ({ value: m, label: m }))} /></div>
        <div><label className="text-xs">Quant</label><Input inputMode="numeric" value={pack} onChange={(e) => setPack(e.target.value)} placeholder="24" className="h-9 w-20 text-sm" /></div>
        <div><label className="text-xs">Cód. barras</label><Input inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="opcional" className="h-9 w-40 text-sm" /></div>
        {/* Só o produto do CD tem setor — e para ele é obrigatório. */}
        {origin === 'CD' && (
          <div className="w-44">
            <Select label="Setor do CD" size="sm" value={novoSetor} onValueChange={setNovoSetor} placeholder="Escolha…" options={setores.map((s) => ({ value: s.id, label: s.name }))} />
          </div>
        )}
        <Button size="sm" disabled={busy || !name.trim() || (origin === 'CD' && !novoSetor)} onClick={async () => { await post({ action: 'catUpsert', name: name.trim(), origin, category: category.trim() || 'Geral', measure, packSize: pack.trim() ? Number(pack.replace(/[^\d]/g, '')) : null, barcode: barcode.trim() || null, cdSectorId: origin === 'CD' ? novoSetor : null }); setName(''); setCategory(''); setPack(''); setBarcode(''); setNovoSetor(null); }}><Plus className="h-4 w-4" /></Button>
      </div>

      {origin === 'CD' && setores.length === 0 && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          Nenhum setor do CD cadastrado. Crie os setores em Configurações → Setores do CD antes de cadastrar produto do CD.
        </p>
      )}

      {/* O MUTIRÃO. Produto do CD sem setor não chega a separador nenhum, e num
          catálogo de mais de mil itens ninguém descobre quais são sem uma lista. */}
      {semSetor.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-warning/30 bg-warning-bg p-3">
          <p className="min-w-0 flex-1 text-sm text-ink-900">
            <b>{semSetor.length} produto(s) do CD sem setor.</b> Enquanto estiverem assim, caem em “Sem setor cadastrado” no pedido e nenhum separador os enxerga.
          </p>
          {/* "Definir setores" vem PRIMEIRO: com mais de mil produtos, corrigir
              um a um pelo filtro é o caminho que ninguém termina. */}
          <Button size="sm" onClick={() => setMutirao((v) => !v)}>
            <Sparkles className="h-4 w-4" /> {mutirao ? 'Fechar' : 'Definir setores'}
          </Button>
          <Button size="sm" variant={soSemSetor ? 'default' : 'outline'} onClick={() => setSoSemSetor((v) => !v)}>
            {soSemSetor ? 'Ver todos' : 'Corrigir um a um'}
          </Button>
        </div>
      )}

      {mutirao && semSetor.length > 0 && (
        <MutiraoDeSetores
          itens={semSetor.map((p) => ({ id: p.id, name: p.name, category: p.category, barcode: p.barcode }))}
          setores={setores}
          onFechar={() => setMutirao(false)}
        />
      )}

      {/* ── PENDÊNCIAS DE CADASTRO — a fila de quem mantém o catálogo. Cada
          card é um filtro: tocar mostra só aquele grupo na lista abaixo. ── */}
      {pendencias && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-900"><ClipboardList className="h-4 w-4 text-brand" /> Pendências de cadastro</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {cards.map((c) => (
              <button
                key={c.k} type="button" aria-pressed={pendencia === c.k}
                onClick={() => { setPendencia(pendencia === c.k ? null : c.k); setSoSemSetor(false); }}
                className={`rounded-lg border p-2 text-left ${pendencia === c.k ? 'border-brand bg-brand/5' : c.n > 0 ? 'border-warning/40 bg-warning-bg' : 'border-line bg-surface'}`}
              >
                <p className={`text-lg font-bold tabular-nums ${c.n > 0 ? 'text-ink-900' : 'text-ink-500'}`}>{c.n}</p>
                <p className="text-[11px] text-ink-700">{c.rotulo}</p>
              </button>
            ))}
          </div>
          {pendencia === 'dups' && pendencias.duplicidades.length > 0 && (
            <ul className="mt-2 divide-y divide-line rounded-lg border bg-surface text-sm">
              {pendencias.duplicidades.map((d) => (
                <li key={`${d.aId}-${d.bId}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 text-ink-900">
                    <button type="button" className="text-brand underline" onClick={() => setFichaId(d.aId)}>{d.aName}</button>
                    <span className="text-ink-500"> × </span>
                    <button type="button" className="text-brand underline" onClick={() => setFichaId(d.bId)}>{d.bName}</button>
                  </span>
                  <span className="text-[11px] text-ink-500">Abra um deles e transfira os códigos para o que fica; depois desative o outro.</span>
                </li>
              ))}
            </ul>
          )}
          {pendencia === 'codigos' && pendencias.codigosNovos.length > 0 && (
            <p className="mt-2 text-xs text-ink-500">Códigos vinculados pelo pedido e ainda não revisados. Abra a ficha do produto para revisar, transferir ou remover.</p>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar no catálogo por nome, categoria ou qualquer código…" className="h-10 w-full rounded-lg border-2 border-line-strong bg-surface pl-9 pr-3 text-sm" />
      </div>

      {/* ── LOTE: aparece só com seleção. ── */}
      {selecao.size > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border-2 border-brand/40 bg-brand/5 p-2.5">
          <p className="w-full text-sm font-semibold text-ink-900 sm:w-auto">{selecao.size} selecionado(s)</p>
          <div className="w-44"><Select label="Definir setor" size="sm" value={loteSetor} placeholder="Escolha…" onValueChange={setLoteSetor} options={setores.map((s) => ({ value: s.id, label: s.name }))} /></div>
          <Button size="sm" disabled={busy || !loteSetor} onClick={() => void lote({ cdSectorId: loteSetor })}>Aplicar setor</Button>
          <div className="w-36"><Select label="Alterar origem" size="sm" value={loteOrigem} placeholder="Escolha…" onValueChange={setLoteOrigem} options={[{ value: 'FABRICA', label: 'Fábrica' }, { value: 'CD', label: 'CD' }]} /></div>
          <Button size="sm" disabled={busy || !loteOrigem} onClick={() => void lote({ origin: loteOrigem, ...(loteOrigem === 'CD' && loteSetor ? { cdSectorId: loteSetor } : {}) })}>Aplicar origem</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void lote({ active: true })}>Ativar</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void lote({ active: false })}>Desativar</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelecao(new Set())}>Limpar seleção</Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-500">{filtered.length} de {products.length} produto(s){pendencia ? ` · filtro: ${cards.find((c) => c.k === pendencia)?.rotulo}` : ''}</p>
        {filtered.length > 0 && (
          <button type="button" className="text-xs text-brand underline" onClick={() => setSelecao(new Set(filtered.map((p) => p.id)))}>Selecionar os {filtered.length} da lista</button>
        )}
      </div>
      <div className="space-y-1.5">
        {filtered.map((p) => (
          <div key={p.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${p.active ? 'bg-surface' : 'bg-canvas opacity-60'}`}>
            <input type="checkbox" aria-label={`Selecionar ${p.name}`} checked={selecao.has(p.id)} onChange={() => alternar(p.id)} className="h-4 w-4 shrink-0 accent-brand" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink-900">
                {p.name}
                {p.validation === 'PENDENTE' && (
                  <span className="shrink-0 rounded-pill bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning">Pendente de validação</span>
                )}
              </p>
              <p className="text-[11px] text-ink-500">
                {p.origin === 'CD' ? 'CD' : 'Fábrica'} · {p.category} · {p.measure}
                {p.packSize ? ` · cx com ${p.packSize}` : ''}
                {p.barcode ? ` · ${p.barcode}` : ''}
                {(p.codigos?.length ?? 0) > 1 ? ` (+${(p.codigos?.length ?? 1) - 1} código(s))` : ''}
                {(p.codigosNovos ?? 0) > 0 ? ` · ${p.codigosNovos} código(s) a revisar` : ''}
                {p.validation === 'PENDENTE' && p.createdByName ? ` · cadastrado por ${p.createdByName} no pedido` : ''}
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setFichaId(p.id)}>
              <Pencil className="h-3.5 w-3.5" /> Ver / editar
            </Button>
            {/* O setor se atribui NA LINHA, sem abrir formulário: são mais de mil
                produtos para acertar, e um modal por item tornaria o mutirão
                inviável. Trocar aqui já salva. */}
            {p.origin === 'CD' && (
              <div className="w-40 shrink-0">
                <Select
                  aria-label={`Setor do CD de ${p.name}`}
                  size="sm"
                  value={p.cdSectorId ?? null}
                  disabled={busy || setores.length === 0}
                  placeholder="Sem setor"
                  onValueChange={(v) => post({ action: 'catUpsert', id: p.id, name: p.name, origin: p.origin, category: p.category, measure: p.measure, cdSectorId: v })}
                  options={setores.map((s) => ({ value: s.id, label: s.name }))}
                  className={p.cdSectorId ? undefined : 'border-warning'}
                />
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {/* Validar só COM setor: é o setor que tira o produto do balde
                  "sem setor" e o entrega a um separador. O botão fica
                  desabilitado até o setor ser escolhido na própria linha. */}
              {p.validation === 'PENDENTE' && (
                <Button
                  size="sm" disabled={busy || (p.origin === 'CD' && !p.cdSectorId)}
                  title={p.origin === 'CD' && !p.cdSectorId ? 'Escolha o setor do CD antes de validar' : undefined}
                  onClick={() => post({ action: 'catValidar', id: p.id })}
                >
                  Validar
                </Button>
              )}
              <button onClick={() => post({ action: 'catToggle', id: p.id, active: !p.active })} disabled={busy} className="text-xs text-brand underline">{p.active ? 'desativar' : 'ativar'}</button>
              <button onClick={() => { if (confirm(`Excluir "${p.name}"?`)) post({ action: 'catDelete', id: p.id }); }} disabled={busy} className="text-danger"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <FichaDoProdutoSheet
        productId={fichaId}
        onClose={() => setFichaId(null)}
        setores={setores}
        produtos={products.map((p) => ({ id: p.id, name: p.name, category: p.category, measure: p.measure, barcode: p.barcode, barcodes: p.codigos }))}
      />
    </div>
  );
}
