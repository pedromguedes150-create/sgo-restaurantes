'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Minus, Search, Sparkles, ShoppingCart, Send, X, PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/ds/sheet';
import { QrScanner } from '@/components/notes/qr-scanner';
import { buscarProdutos, produtoPorCodigo, soDigitos, type ProdutoBuscavel } from '@/lib/products/busca';

export interface ProdutoNaTela extends ProdutoBuscavel {
  packSize?: number | null;
}

export interface SugestaoNaTela {
  productId: string;
  name: string;
  measure: string;
  qtySugerida: number;
  ultimas: number[];
  vezes: number;
}

export interface PedidoRecente {
  id: string;
  number: number;
  statusLabel: string;
  quando: string;
  itens: number;
}

type Etapa = 'INICIO' | 'MONTANDO' | 'REVISAO';

/**
 * PEDIDOS INTERNOS — a tela do gerente.
 *
 * Mobile-first porque é onde o pedido é feito: no salão, com pressa, uma mão no
 * celular. O que isso muda na prática — a tela NÃO abre com a lista inteira de
 * produtos e um `- 0 +` em cada linha, que era o desenho antigo. Abre com um
 * botão, e os produtos entram um a um, pela câmera ou pela busca.
 */
export function PedidoClient({
  unitId,
  unitName,
  produtos,
  sugestoes,
  recentes,
  podeAssociarCodigo,
}: {
  unitId: string;
  unitName: string;
  produtos: ProdutoNaTela[];
  sugestoes: SugestaoNaTela[];
  recentes: PedidoRecente[];
  /** Associar código é permanente e vale para a rede — fica com quem edita o catálogo. */
  podeAssociarCodigo: boolean;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>('INICIO');
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [termo, setTermo] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Código lido que não bateu com produto nenhum. */
  const [naoReconhecido, setNaoReconhecido] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const resultados = useMemo(() => buscarProdutos(produtos, termo), [produtos, termo]);
  const itens = Object.entries(carrinho).filter(([, q]) => q > 0);
  const totalItens = itens.length;

  function somar(productId: string, delta: number) {
    setCarrinho((c) => {
      const novo = Math.max(0, Math.round(((c[productId] ?? 0) + delta) * 1000) / 1000);
      return { ...c, [productId]: novo };
    });
  }
  function definir(productId: string, qtd: number) {
    setCarrinho((c) => ({ ...c, [productId]: Math.max(0, qtd) }));
  }

  function aoLerCodigo(codigo: string) {
    setAviso(null); setNaoReconhecido(null);
    const p = produtoPorCodigo(produtos, codigo);
    if (!p) { setNaoReconhecido(soDigitos(codigo)); return; }
    somar(p.id, 1);
    setAviso(`${p.name} — adicionado (${(carrinho[p.id] ?? 0) + 1} ${p.measure}).`);
  }

  async function associar(productId: string) {
    if (!naoReconhecido) return;
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/products/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'associarCodigo', productId, code: naoReconhecido }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Não foi possível associar o código.'); return; }
      somar(productId, 1);
      setNaoReconhecido(null);
      setAviso('Código associado e produto adicionado.');
      router.refresh();
    } finally { setBusy(false); }
  }

  async function enviar() {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/products/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'criar', unitId, note: nota,
          items: itens.map(([productId, qty]) => ({ productId, qty })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Não foi possível enviar o pedido.'); return; }
      setCarrinho({}); setNota(''); setEtapa('INICIO');
      router.refresh();
      setAviso(
        `Pedido nº ${d.number} enviado ao CD.` +
        (d.semSetor > 0 ? ` ${d.semSetor} item(ns) estão sem setor do CD cadastrado e não foram direcionados a ninguém.` : ''),
      );
    } finally { setBusy(false); }
  }

  /* ── INÍCIO ── */
  if (etapa === 'INICIO') {
    return (
      <div className="space-y-4">
        {aviso && <p className="rounded-lg border border-success bg-success/10 p-2.5 text-sm text-success">{aviso}</p>}

        <Button size="lg" className="w-full sm:w-auto" onClick={() => { setAviso(null); setEtapa('MONTANDO'); }}>
          <Plus className="h-5 w-5" /> Iniciar pedido
        </Button>

        {sugestoes.length > 0 && (
          <div className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
              <Sparkles className="h-4 w-4 text-brand" /> Sugestão para o seu próximo pedido
            </p>
            <p className="mb-2 text-xs text-ink-700">
              Do histórico desta unidade. Nada é enviado sozinho — você escolhe.
            </p>
            <ul className="space-y-1">
              {sugestoes.slice(0, 6).map((s) => (
                <li key={s.productId} className="flex items-center justify-between gap-2 border-b border-line py-1 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink-900">{s.name}</span>
                    {/* De onde veio o número: sem isto a sugestão é um palpite
                        sem origem, e ninguém confia. */}
                    <span className="block text-[11px] text-ink-500">
                      normalmente {s.qtySugerida} {s.measure} · últimos: {s.ultimas.join(' | ')}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => { definir(s.productId, s.qtySugerida); setEtapa('MONTANDO'); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              size="sm" className="mt-2"
              onClick={() => {
                const c: Record<string, number> = {};
                for (const s of sugestoes) c[s.productId] = s.qtySugerida;
                setCarrinho(c); setEtapa('MONTANDO');
              }}
            >
              Montar pedido sugerido
            </Button>
          </div>
        )}

        <div>
          <p className="mb-1 text-sm font-semibold text-ink-900">Últimos pedidos</p>
          {recentes.length === 0 ? (
            <p className="text-sm text-ink-500">Nenhum pedido ainda.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border">
              {recentes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <b className="text-ink-900">nº {r.number}</b>
                    <span className="block text-[11px] text-ink-500">{r.quando} · {r.itens} item(ns)</span>
                  </span>
                  <span className="text-xs font-semibold text-ink-700">{r.statusLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  /* ── REVISÃO ── */
  if (etapa === 'REVISAO') {
    return (
      <div className="space-y-3 pb-24">
        <div className="rounded-lg border bg-surface p-3 text-sm">
          <p className="font-bold text-ink-900">Revisar pedido</p>
          <p className="text-xs text-ink-700">Unidade: {unitName} · Destino: Centro de Distribuição · {totalItens} produto(s)</p>
        </div>

        <ul className="divide-y divide-line rounded-lg border">
          {itens.map(([id, q]) => {
            const p = porId.get(id);
            return (
              <li key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink-900">{p?.name ?? id}</span>
                <span className="shrink-0 tabular-nums text-ink-700">{q} {p?.measure}</span>
              </li>
            );
          })}
        </ul>

        <div>
          <Label className="text-xs">Observação para o CD</Label>
          <Input value={nota} onChange={(e) => setNota(e.target.value)} className="h-10 text-sm" placeholder="opcional" />
        </div>

        {erro && <p className="text-sm font-medium text-danger">{erro}</p>}

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3">
          <div className="mx-auto flex max-w-3xl gap-2">
            <Button size="lg" className="flex-1" disabled={busy || totalItens === 0} onClick={() => void enviar()}>
              <Send className="h-5 w-5" /> {busy ? 'Enviando…' : 'Enviar pedido ao CD'}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setEtapa('MONTANDO')}>Voltar</Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── MONTANDO ── */
  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <QrScanner
          onResult={aoLerCodigo}
          parse={(t) => t.trim() || null}
          label="Escanear produto"
          ajuda={<>Aponte para o <strong>código de barras</strong> do produto.</>}
        />
        <Button size="sm" variant="outline" onClick={() => setEtapa('INICIO')}>
          <X className="h-4 w-4" /> Sair
        </Button>
      </div>

      {aviso && <p className="rounded-md bg-success/10 p-2 text-sm text-success">{aviso}</p>}
      {erro && <p className="text-sm font-medium text-danger">{erro}</p>}

      <div>
        <Label className="flex items-center gap-1.5 text-xs"><Search className="h-3.5 w-3.5" /> Pesquisar produto</Label>
        <Input
          value={termo} onChange={(e) => setTermo(e.target.value)}
          placeholder="nome, categoria ou código de barras"
          className="h-11 text-base"
        />
        <p className="mt-1 text-[11px] text-ink-500">Pode digitar sem acento: &quot;mucarela&quot; acha &quot;Muçarela&quot;.</p>
      </div>

      {termo.trim() && (
        <ul className="divide-y divide-line rounded-lg border">
          {resultados.length === 0 && (
            <li className="px-3 py-3 text-sm text-ink-500">Nenhum produto encontrado para &quot;{termo}&quot;.</li>
          )}
          {resultados.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink-900">{p.name}</span>
                <span className="block text-[11px] text-ink-500">
                  {p.category} · {p.measure}{p.packSize ? ` · ${p.packSize} por embalagem` : ''}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => somar(p.id, -1)} aria-label="Diminuir"><Minus className="h-4 w-4" /></Button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">{carrinho[p.id] ?? 0}</span>
                <Button size="sm" variant="ghost" onClick={() => somar(p.id, 1)} aria-label="Aumentar"><Plus className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalItens > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-ink-900">No pedido ({totalItens})</p>
          <ul className="divide-y divide-line rounded-lg border">
            {itens.map(([id, q]) => {
              const p = porId.get(id);
              return (
                <li key={id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-ink-900">{p?.name ?? id}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => somar(id, -1)} aria-label="Diminuir"><Minus className="h-4 w-4" /></Button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{q}</span>
                    <Button size="sm" variant="ghost" onClick={() => somar(id, 1)} aria-label="Aumentar"><Plus className="h-4 w-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Código lido que não existe no catálogo ── */}
      {naoReconhecido && (
        <Sheet
          open onClose={() => setNaoReconhecido(null)}
          title="Código não reconhecido"
          description={`Código lido: ${naoReconhecido}`}
        >
          <div className="space-y-3">
            <p className="text-sm text-ink-700">
              Localize o produto na lista abaixo. {podeAssociarCodigo
                ? 'Você pode associar este código a ele para as próximas vezes.'
                : 'O produto entra no pedido; associar o código ao catálogo é com quem edita produtos.'}
            </p>
            <Input
              value={termo} onChange={(e) => setTermo(e.target.value)}
              placeholder="buscar produto…" className="h-11 text-base" autoFocus
            />
            <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border">
              {resultados.slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-ink-900">{p.name}</span>
                  <div className="flex shrink-0 gap-1">
                    {podeAssociarCodigo && (
                      <Button size="sm" disabled={busy} onClick={() => void associar(p.id)}>Associar</Button>
                    )}
                    <Button
                      size="sm" variant="outline"
                      onClick={() => { somar(p.id, 1); setNaoReconhecido(null); setAviso(`${p.name} — adicionado.`); }}
                    >
                      Só desta vez
                    </Button>
                  </div>
                </li>
              ))}
              {resultados.length === 0 && (
                <li className="flex items-center gap-2 px-3 py-3 text-sm text-ink-500">
                  <PackageSearch className="h-4 w-4" /> Digite para procurar o produto.
                </li>
              )}
            </ul>
            {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
          </div>
        </Sheet>
      )}

      {/* Barra fixa: o carrinho e a saída para a revisão ficam sempre ao alcance
          do polegar — a lista de produtos rola, ela não. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            <ShoppingCart className="h-4 w-4" /> {totalItens} item(ns)
          </span>
          <Button size="lg" className="ml-auto" disabled={totalItens === 0} onClick={() => { setErro(null); setEtapa('REVISAO'); }}>
            Revisar pedido
          </Button>
        </div>
      </div>
    </div>
  );
}
