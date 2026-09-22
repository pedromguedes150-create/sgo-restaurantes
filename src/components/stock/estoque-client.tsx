'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Save, PackagePlus, Link2, CalendarClock, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { StatCard } from '@/components/ui/ds/stat-card';
import { Group } from '@/components/ui/ds/group';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { QrScanner } from '@/components/notes/qr-scanner';
import { ROTULO_EMBALAGEM, type TipoDeEmbalagem } from '@/lib/stock/embalagem';
import type { Faixa } from '@/lib/stock/validade';

/* Os tipos vivem aqui, como nos demais módulos: a página de servidor adapta o
   que vem do banco para eles, e o cliente nunca alcança um módulo de Prisma. */
export interface UnidadeUI { id: string; name: string }
export interface LinhaUI {
  lotId: string; produto: string; categoria: string;
  lotCode: string | null; expiresAt: string | null;
  unidades: number; quantidade: string; qtyReceived: number;
  faixa: Faixa | null; pendente: boolean;
}
export interface EstoqueUI {
  hoje: string;
  linhas: LinhaUI[];
  pendencias: LinhaUI[];
  contagens: { total: number; lotes: number; vencidos: number; criticos: number; atencao: number; proximos: number };
}
interface ProdutoUI {
  id: string; name: string; category: string; measure: string;
  packType: TipoDeEmbalagem; packSize: number | null;
  trackExpiry: boolean; alertDays: number; codigos: string[];
}

/** Semáforo: a faixa traz o tom em linguagem de design system, a tela traduz. */
const TOM: Record<string, StatusTone> = { danger: 'critical', warning: 'medium', success: 'success' };

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
  const r = await fetch('/api/estoque', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: 'Falha de comunicação.' }));
}

export function EstoqueClient({ podeLancar, units, unitId, estoque }: {
  podeLancar: boolean; units: UnidadeUI[]; unitId: string | null; estoque: EstoqueUI;
}) {
  const [aba, setAba] = useState<'bipar' | 'estoque' | 'validade'>(
    /* Pendência de validade é trabalho parado: quem tem, cai nela. */
    estoque.pendencias.length > 0 ? 'validade' : podeLancar ? 'bipar' : 'estoque',
  );

  if (!unitId) return <p className="text-sm text-ink-500">Nenhuma unidade no seu alcance.</p>;
  const unidade = units.find((u) => u.id === unitId);

  const abas = [
    ...(podeLancar ? [{ value: 'bipar', label: 'Bipar' }] : []),
    { value: 'estoque', label: `Estoque (${estoque.contagens.lotes})` },
    { value: 'validade', label: estoque.pendencias.length ? `Validade (${estoque.pendencias.length})` : 'Validade' },
  ];

  return (
    <div className="space-y-4">
      {units.length > 1 && (
        <p className="sgo-type-13 text-ink-500">Unidade: <b className="text-ink-900">{unidade?.name}</b> — troque no seletor do cabeçalho.</p>
      )}
      <SegmentedControl aria-label="Seções do Estoque" value={aba} onValueChange={(v) => setAba(v as typeof aba)} options={abas} />

      {aba === 'bipar' && podeLancar && <Bipar unitId={unitId} />}
      {aba === 'estoque' && <Prateleira estoque={estoque} />}
      {aba === 'validade' && <Validade estoque={estoque} podeLancar={podeLancar} />}
    </div>
  );
}

/* ═════════════════════════ BIPAR ═════════════════════════ */

/**
 * O caminho principal, e ele é UM campo.
 *
 * O leitor de código de barras se comporta como teclado: ele digita e dá Enter.
 * Por isso o campo fica focado e o Enter dispara a busca — o gerente anda pela
 * prateleira e não toca na tela entre um produto e outro. A câmera é a saída
 * para quem não tem leitor, não o caminho normal.
 */
function Bipar({ unitId }: { unitId: string }) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState('');
  const [termo, setTermo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [achado, setAchado] = useState<
    | { tipo: 'PRODUTO'; produto: ProdutoUI }
    | { tipo: 'CANDIDATOS'; codigo: string; candidatos: ProdutoUI[] }
    | { tipo: 'NOVO'; codigo: string }
    | null
  >(null);

  function voltarAoCampo() {
    setAchado(null); setCodigo(''); setTermo('');
    /* Sem isto o gerente precisa tocar no campo a cada produto — com 80 itens
       na prateleira, são 80 toques que não precisavam existir. */
    setTimeout(() => campo.current?.focus(), 30);
  }

  async function bipar(valor?: string) {
    const c = (valor ?? codigo).trim();
    if (!c) return;
    setBusy(true); setErro(''); setOk('');
    const r = await post({ action: 'bipar', codigo: c, termo: termo.trim() || undefined });
    setBusy(false);
    if (!r.ok) { setErro(String(r.error ?? 'Falha ao ler o código.')); return; }
    const achadoTipo = String(r.achado);
    if (achadoTipo === 'PRODUTO') setAchado({ tipo: 'PRODUTO', produto: r.produto as ProdutoUI });
    else if (achadoTipo === 'CANDIDATOS') setAchado({ tipo: 'CANDIDATOS', codigo: String(r.codigo), candidatos: r.candidatos as ProdutoUI[] });
    else setAchado({ tipo: 'NOVO', codigo: String(r.codigo) });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cod"><ScanLine className="mr-1 inline h-4 w-4" /> Código de barras</Label>
        <div className="flex gap-2">
          <Input
            id="cod" ref={campo} autoFocus inputMode="numeric" value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void bipar(); } }}
            placeholder="Bipe ou digite e tecle Enter"
            className="flex-1"
          />
          <Button variant="outline" disabled={busy || !codigo.trim()} onClick={() => void bipar()}><Search className="h-4 w-4" /></Button>
        </div>
        <QrScanner
          label="Usar a câmera"
          parse={(t) => (t.replace(/\D/g, '').length >= 8 ? t.replace(/\D/g, '') : null)}
          ajuda={<>Aponte para o <strong>código de barras</strong> da embalagem.</>}
          onResult={(v) => { setCodigo(v); void bipar(v); }}
        />
      </div>

      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
      {ok && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success"><Check className="mr-1 inline h-4 w-4" />{ok}</p>}

      {achado?.tipo === 'PRODUTO' && (
        <Entrada
          unitId={unitId} produto={achado.produto}
          onSalvo={(msg) => { setOk(msg); voltarAoCampo(); router.refresh(); }}
        />
      )}

      {achado?.tipo === 'CANDIDATOS' && (
        <Candidatos
          codigo={achado.codigo} candidatos={achado.candidatos}
          onVinculado={(p) => { setOk(`Código vinculado a ${p.name}.`); setAchado({ tipo: 'PRODUTO', produto: p }); }}
          onNenhum={() => setAchado({ tipo: 'NOVO', codigo: achado.codigo })}
        />
      )}

      {achado?.tipo === 'NOVO' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-sunken p-3">
            <p className="sgo-type-15 font-semibold text-ink-900">Produto não encontrado</p>
            <p className="sgo-type-13 text-ink-700">
              O código <b>{achado.codigo}</b> não está na base. Se ele for de um produto que JÁ existe, digite o nome abaixo
              e bipe de novo — o SGO oferece o vínculo em vez de criar um cadastro repetido.
            </p>
            <Input
              className="mt-2" value={termo} onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome do produto (para procurar antes de cadastrar)"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void bipar(achado.codigo); } }}
            />
          </div>
          <NovoProduto
            codigo={achado.codigo} nomeInicial={termo}
            onCriado={(p) => { setOk(`${p.name} cadastrado para toda a rede.`); setAchado({ tipo: 'PRODUTO', produto: p }); }}
          />
        </div>
      )}
    </div>
  );
}

/** "Este código é deste produto?" — quem decide é quem está com a embalagem. */
function Candidatos({ codigo, candidatos, onVinculado, onNenhum }: {
  codigo: string; candidatos: ProdutoUI[];
  onVinculado: (p: ProdutoUI) => void; onNenhum: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  return (
    <div className="space-y-2">
      <p className="sgo-type-15 font-semibold text-ink-900">Código novo — é uma variação de algum destes?</p>
      <p className="sgo-type-13 text-ink-700">
        Vincular evita um segundo cadastro do mesmo produto, que criaria dois saldos para a mesma prateleira.
      </p>
      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
      <Group>
        {candidatos.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate sgo-type-15 font-semibold text-ink-900">{c.name}</p>
              <p className="sgo-type-11 text-ink-500">{c.category} · {c.codigos.length} código(s)</p>
            </div>
            <Button
              size="sm" disabled={busy}
              onClick={async () => {
                setBusy(true); setErro('');
                const r = await post({ action: 'vincular', productId: c.id, codigo });
                setBusy(false);
                if (r.ok) onVinculado(r.produto as ProdutoUI); else setErro(String(r.error ?? 'Falha'));
              }}
            ><Link2 className="h-4 w-4" /> Vincular</Button>
          </div>
        ))}
      </Group>
      <Button variant="outline" size="sm" onClick={onNenhum}>Nenhum destes — é produto novo</Button>
    </div>
  );
}

/** Cadastro rápido, da prateleira. Nasce LOCAL e vale para a rede inteira. */
function NovoProduto({ codigo, nomeInicial, onCriado }: { codigo: string; nomeInicial: string; onCriado: (p: ProdutoUI) => void }) {
  const [name, setName] = useState(nomeInicial);
  const [category, setCategory] = useState('Geral');
  const [packType, setPackType] = useState<TipoDeEmbalagem>('UN');
  const [packSize, setPackSize] = useState('');
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [alertDays, setAlertDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <p className="sgo-type-15 font-semibold text-ink-900"><PackagePlus className="mr-1 inline h-4 w-4 text-brand" /> Cadastrar produto novo</p>
      <div><Label htmlFor="np">Nome</Label><Input id="np" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Arroz Tio João 5 kg" /></div>
      <div><Label htmlFor="nc">Categoria</Label><Input id="nc" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Embalagem" value={packType} onValueChange={(v) => setPackType(v as TipoDeEmbalagem)}
          options={[{ value: 'UN', label: 'Unidade' }, { value: 'FARDO', label: 'Fardo' }, { value: 'DISPLAY', label: 'Display' }]}
        />
        {packType !== 'UN' && (
          <div>
            <Label htmlFor="ns">Unidades dentro</Label>
            <Input id="ns" inputMode="numeric" value={packSize} onChange={(e) => setPackSize(e.target.value)} placeholder="12" />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 sgo-type-15 text-ink-900">
        <input type="checkbox" checked={trackExpiry} onChange={(e) => setTrackExpiry(e.target.checked)} className="h-4 w-4 accent-brand" />
        Controlar validade deste produto
      </label>
      {trackExpiry && (
        <div>
          <Label htmlFor="na">Avisar com quantos dias de antecedência</Label>
          <Input id="na" inputMode="numeric" value={alertDays} onChange={(e) => setAlertDays(e.target.value)} className="w-24" />
          <p className="mt-1 sgo-type-11 text-ink-500">
            Só o PRIMEIRO aviso. Os alertas de 7 dias, 2 dias, vence hoje e vencido são iguais para todos os produtos.
          </p>
        </div>
      )}
      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
      <Button
        className="w-full" disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true); setErro('');
          const r = await post({
            action: 'cadastrar', codigo, name: name.trim(), category: category.trim(),
            packType, packSize: packSize.trim() ? Number(packSize.replace(/\D/g, '')) : null,
            trackExpiry, alertDays: Number(alertDays.replace(/\D/g, '')) || 30,
          });
          setBusy(false);
          if (r.ok) onCriado(r.produto as ProdutoUI); else setErro(String(r.error ?? 'Falha'));
        }}
      ><Save className="h-4 w-4" /> Cadastrar e continuar</Button>
    </div>
  );
}

/** Quantidade + lote/validade. O rótulo segue a embalagem do produto. */
function Entrada({ unitId, produto, onSalvo }: { unitId: string; produto: ProdutoUI; onSalvo: (msg: string) => void }) {
  const [quantidade, setQuantidade] = useState('');
  const [lotCode, setLotCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const r = ROTULO_EMBALAGEM[produto.packType];
  const fator = produto.packType === 'UN' ? 1 : Math.max(1, produto.packSize ?? 1);
  const emUn = useMemo(() => {
    const q = Number(quantidade.replace(',', '.'));
    return Number.isFinite(q) && q > 0 ? Math.round(q * fator * 1000) / 1000 : 0;
  }, [quantidade, fator]);

  return (
    <div className="space-y-3 rounded-lg border border-brand/30 bg-brand-tint p-3">
      <div>
        <p className="sgo-type-17 font-semibold text-ink-900">{produto.name}</p>
        <p className="sgo-type-11 text-ink-500">
          {produto.category} · {produto.packType === 'UN' ? 'por unidade' : `${r.singular} com ${fator} un`}
          {produto.trackExpiry ? ' · controla validade' : ''}
        </p>
      </div>

      <div>
        <Label htmlFor="q">Quantos {r.plural}?</Label>
        <Input id="q" autoFocus inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="0" />
        {produto.packType !== 'UN' && emUn > 0 && (
          /* A conversão fica visível ANTES de salvar: o gerente conferiu fardos
             e o saldo guardado é em unidades. */
          <p className="mt-1 sgo-type-13 font-semibold text-brand">= {emUn.toLocaleString('pt-BR')} unidades</p>
        )}
      </div>

      {produto.trackExpiry && (
        <>
          <DatePicker label="Validade deste lote" value={expiresAt || null} onValueChange={(v) => setExpiresAt(v ?? '')} />
          <div><Label htmlFor="l">Lote (opcional)</Label><Input id="l" value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="L1234" /></div>
        </>
      )}

      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
      <Button
        className="w-full" size="lg" disabled={busy || !quantidade.trim()}
        onClick={async () => {
          setBusy(true); setErro('');
          const resp = await post({
            action: 'entrada', unitId, productId: produto.id,
            quantidade: Number(quantidade.replace(',', '.')),
            lotCode: lotCode.trim() || null, expiresAt: expiresAt || null,
          });
          setBusy(false);
          if (resp.ok) onSalvo(`${produto.name}: ${Number(resp.unidades).toLocaleString('pt-BR')} un no estoque.`);
          else setErro(String(resp.error ?? 'Falha ao salvar.'));
        }}
      ><Save className="h-5 w-5" /> Salvar e bipar o próximo</Button>
    </div>
  );
}

/* ═════════════════════════ PRATELEIRA ═════════════════════════ */

function Prateleira({ estoque }: { estoque: EstoqueUI }) {
  const [q, setQ] = useState('');
  const linhas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return estoque.linhas;
    return estoque.linhas.filter((l) => l.produto.toLowerCase().includes(t) || (l.lotCode ?? '').toLowerCase().includes(t));
  }, [estoque.linhas, q]);

  if (estoque.linhas.length === 0) {
    return <p className="text-sm text-ink-500">Nenhum lote em estoque nesta unidade. Use a aba <b>Bipar</b> para lançar o primeiro.</p>;
  }
  return (
    <div className="space-y-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar produto ou lote" />
      <Group>
        {linhas.map((l) => <LinhaDoLote key={l.lotId} l={l} />)}
      </Group>
      {linhas.length === 0 && <p className="text-sm text-ink-500">Nada encontrado.</p>}
    </div>
  );
}

function LinhaDoLote({ l }: { l: LinhaUI }) {
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate sgo-type-15 font-semibold text-ink-900">{l.produto}</p>
          <p className="sgo-type-11 text-ink-500">
            {l.quantidade}
            {l.lotCode ? ` · Lote ${l.lotCode}` : ''}
            {l.expiresAt ? ` · Validade ${l.expiresAt.split('-').reverse().join('/')}` : ''}
          </p>
        </div>
        {l.faixa && <StatusBadge tone={TOM[l.faixa.tom] ?? 'neutral'}>{l.faixa.chave === 'VENCIDO' ? 'Vencido' : l.faixa.rotulo}</StatusBadge>}
      </div>
    </div>
  );
}

/* ═════════════════════════ VALIDADE ═════════════════════════ */

function Validade({ estoque, podeLancar }: { estoque: EstoqueUI; podeLancar: boolean }) {
  const emAlerta = estoque.linhas.filter((l) => l.faixa);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Vencidos" value={String(estoque.contagens.vencidos)} />
        <StatCard label="Críticos (até 2 dias)" value={String(estoque.contagens.criticos)} />
        <StatCard label="Atenção (até 7 dias)" value={String(estoque.contagens.atencao)} />
        <StatCard label="Próximos" value={String(estoque.contagens.proximos)} />
      </div>

      {estoque.pendencias.length > 0 && podeLancar && (
        <div className="space-y-2">
          <p className="sgo-type-17 font-semibold text-ink-900">Precisam da sua resposta ({estoque.pendencias.length})</p>
          <p className="sgo-type-13 text-ink-700">
            O SGO não sabe o que foi vendido — não há PDV integrado. Responder aqui é o que mantém o alerta útil:
            sem isso ele repetiria a mesma pergunta todo dia sobre um lote que talvez já tenha acabado.
          </p>
          {estoque.pendencias.map((l) => <CartaoDeTratativa key={l.lotId} l={l} />)}
        </div>
      )}

      {emAlerta.length === 0 && <p className="text-sm text-ink-500">Nenhum lote próximo do vencimento. 🎉</p>}
      {emAlerta.length > 0 && (
        <div className="space-y-2">
          <p className="sgo-type-17 font-semibold text-ink-900">Próximos do vencimento</p>
          <Group>{emAlerta.map((l) => <LinhaDoLote key={l.lotId} l={l} />)}</Group>
        </div>
      )}
    </div>
  );
}

/**
 * A pergunta do alerta, com as quatro saídas.
 *
 * "Ainda possui estoque" é a única que pede número, porque é a única em que o
 * lote continua vivo. As outras três encerram o monitoramento por motivos
 * diferentes, e a diferença importa: acabou é normal, descarte é perda, e
 * transferido é mercadoria que está noutra unidade.
 */
function CartaoDeTratativa({ l }: { l: LinhaUI }) {
  const router = useRouter();
  const [quantidade, setQuantidade] = useState('');
  const [pedindoQtd, setPedindoQtd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  async function responder(tratativa: string, qtd?: number) {
    setBusy(true); setErro('');
    const r = await post({ action: 'tratativa', lotId: l.lotId, tratativa, quantidade: qtd });
    setBusy(false);
    if (r.ok) router.refresh(); else setErro(String(r.error ?? 'Falha'));
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow-sgo-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate sgo-type-17 font-semibold text-ink-900">{l.produto}</p>
          <p className="sgo-type-13 text-ink-700">
            {l.lotCode ? `Lote ${l.lotCode} · ` : ''}Validade {l.expiresAt?.split('-').reverse().join('/')}
          </p>
          <p className="sgo-type-11 text-ink-500">Recebido: {l.qtyReceived.toLocaleString('pt-BR')} un · saldo declarado: {l.quantidade}</p>
        </div>
        {l.faixa && <StatusBadge tone={TOM[l.faixa.tom] ?? 'neutral'}>{l.faixa.rotulo}</StatusBadge>}
      </div>

      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}

      {!pedindoQtd ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void responder('FINALIZADO')}>Lote finalizado</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setPedindoQtd(true)}>Ainda possui estoque</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void responder('DESCARTE')}>Descarte / perda</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void responder('TRANSFERIDO')}>Transferido</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`q-${l.lotId}`}>Quanto ainda existe deste lote?</Label>
          <div className="flex gap-2">
            <Input id={`q-${l.lotId}`} autoFocus inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="0" className="flex-1" />
            <Button size="sm" disabled={busy || !quantidade.trim()} onClick={() => void responder('AINDA_TEM', Number(quantidade.replace(',', '.')))}>Salvar</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setPedindoQtd(false)}>Voltar</Button>
          </div>
          <p className="sgo-type-11 text-ink-500">Aproximado serve. O alerta volta quando o lote ficar mais perto do vencimento.</p>
        </div>
      )}
    </div>
  );
}
