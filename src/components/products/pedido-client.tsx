'use client';

import { useMemo, useState } from 'react';
import { ROTULO_CURTO, UNIDADES_DE_PEDIDO, rotuloDaQuantidade, type UnidadeDePedido } from '@/lib/products/embalagem-pedido';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Minus, Search, Sparkles, ShoppingCart, Send, X, PackageSearch, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/ds/sheet';
import { QrScanner } from '@/components/notes/qr-scanner';
import { buscarProdutos, produtoPorCodigo, soDigitos, type ProdutoBuscavel } from '@/lib/products/busca';

export interface ProdutoNaTela extends ProdutoBuscavel {
  packSize?: number | null;
  /** 'FABRICA' | 'CD' — decide para onde o item vai no envio. */
  origin?: string;
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
  /** `PED-2026-001245` — a etiqueta completa, que é única na rede. */
  etiqueta: string;
  statusLabel: string;
  quando: string;
  itens: number;
  separados: number;
  /** Ainda em curso no CD ou a caminho — ganha o cartão em destaque. */
  emAndamento: boolean;
}

type Etapa = 'INICIO' | 'MONTANDO' | 'REVISAO';

/**
 * PEDIDOS INTERNOS — a tela do gerente.
 *
 * Mobile-first porque é onde o pedido é feito: no salão, com pressa, uma mão no
 * celular. O que isso muda na prática — a tela NÃO abre com a lista inteira de
 * produtos e um `- 0 +` em cada linha, que era o desenho antigo. Abre com um
 * botão, e os produtos entram um a um, pela câmera ou pela busca.
 *
 * A tira de embalagem abaixo faz parte desse desenho: ela vive NA LINHA do
 * item, com um toque por escolha.
 */

/**
 * A TIRA DE EMBALAGEM.
 *
 * Quatro botões numa linha, um toque para escolher. Mobile-first de verdade:
 * um seletor suspenso ou um modal custaria dois toques por item, e o gerente
 * repete isso trinta vezes num pedido.
 *
 * ⚠️ O que ela NÃO faz: perguntar quantas unidades vêm dentro. O pedido diz
 * "2 fardos" e o SGO registra "2 fardos" — quem separa lê isso e separa isso.
 */
function TiraDeEmbalagem({ valor, onEscolher }: { valor: UnidadeDePedido; onEscolher: (u: UnidadeDePedido) => void }) {
  return (
    <div className="mt-1.5 flex gap-1" role="group" aria-label="Como está pedindo">
      {UNIDADES_DE_PEDIDO.map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={valor === u}
          onClick={() => onEscolher(u)}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
            valor === u ? 'border-brand bg-brand text-on-brand' : 'border-line text-ink-700 hover:border-brand hover:text-brand'
          }`}
        >
          {ROTULO_CURTO[u]}
        </button>
      ))}
    </div>
  );
}

/** O que o carrinho guarda por produto: quanto, e em que embalagem. */
interface ItemNoCarrinho { qty: number; pack: UnidadeDePedido }
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
  /* O carrinho guarda QUANTIDADE + COMO foi pedido. Só a quantidade não
     bastava: "2" de Coca-Cola pode ser 2 latas ou 2 fardos, e quem separa
     precisa saber qual. O SGO não converte um no outro e não consulta o
     cadastro para saber quantas vêm dentro — ver `embalagem-pedido.ts`. */
  const [carrinho, setCarrinho] = useState<Record<string, ItemNoCarrinho>>({});
  const [termo, setTermo] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Código lido que não bateu com produto nenhum. */
  const [naoReconhecido, setNaoReconhecido] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const resultados = useMemo(() => buscarProdutos(produtos, termo), [produtos, termo]);
  /* O mais recente ainda em curso. Mais de um aberto é raro e, quando
     acontece, o novo é o que interessa. */
  const emCurso = recentes.find((r) => r.emAndamento);
  const itens = Object.entries(carrinho).filter(([, i]) => i.qty > 0);
  const totalItens = itens.length;

  /* Para onde este carrinho vai. O envio divide por destino no servidor; aqui é
     só para a tela não prometer "ao CD" quando o carrinho é da Fábrica — ou
     quando são os dois. */
  const destinos = useMemo(() => {
    const origens = new Set(itens.map(([id]) => porId.get(id)?.origin).filter(Boolean));
    const temFabrica = origens.has('FABRICA');
    const temCd = origens.has('CD') || origens.size === 0;
    if (temFabrica && temCd) return { rotulo: 'Fábrica e Centro de Distribuição', preposicao: 'à Fábrica e ao CD' };
    if (temFabrica) return { rotulo: 'Fábrica', preposicao: 'à Fábrica' };
    return { rotulo: 'Centro de Distribuição', preposicao: 'ao CD' };
  }, [itens, porId]);

  /**
   * Traz de volta os itens de um pedido antigo.
   *
   * Todo mes a unidade pede quase a mesma coisa, e redigitar trinta linhas e o
   * que faz o pedido sair errado. O carrinho e PREENCHIDO, nao enviado: o
   * gerente ainda revisa e confirma.
   */
  async function repetir(id: string) {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch('/api/products/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repetir', id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Nao foi possivel repetir este pedido.'); return; }

      const carrinhoNovo: Record<string, ItemNoCarrinho> = {};
      for (const i of d.itens as { productId: string; qty: number; packUnit?: UnidadeDePedido }[]) carrinhoNovo[i.productId] = { qty: i.qty, pack: i.packUnit ?? 'UN' };
      setCarrinho(carrinhoNovo);
      setEtapa('REVISAO');
      /* Produto que saiu do catalogo nao volta calado: o gerente precisa saber
         que a lista chegou menor do que o pedido de origem. */
      if (d.ignorados?.length) {
        setAviso(`Fora do pedido por nao estarem mais no catalogo: ${d.ignorados.join(', ')}.`);
      }
    } catch {
      setErro('Sem conexao. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  function somar(productId: string, delta: number) {
    setCarrinho((c) => {
      const atual = c[productId];
      const novo = Math.max(0, Math.round(((atual?.qty ?? 0) + delta) * 1000) / 1000);
      return { ...c, [productId]: { qty: novo, pack: atual?.pack ?? 'UN' } };
    });
  }
  function definir(productId: string, qtd: number) {
    setCarrinho((c) => ({ ...c, [productId]: { qty: Math.max(0, qtd), pack: c[productId]?.pack ?? 'UN' } }));
  }

  /** Troca só a embalagem, preservando a quantidade já digitada. */
  function trocarEmbalagem(productId: string, pack: UnidadeDePedido) {
    setCarrinho((c) => ({ ...c, [productId]: { qty: c[productId]?.qty ?? 1, pack } }));
  }

  function aoLerCodigo(codigo: string) {
    setAviso(null); setNaoReconhecido(null);
    const p = produtoPorCodigo(produtos, codigo);
    if (!p) { setNaoReconhecido(soDigitos(codigo)); return; }
    somar(p.id, 1);
    /* Sem a quantidade no aviso: ela e a embalagem estão logo abaixo, e quem
       bipa em sequência lê o nome para conferir que pegou o produto certo. */
    setAviso(`${p.name} — adicionado. Confira a embalagem e a quantidade abaixo.`);
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
          items: itens.map(([productId, i]) => ({ productId, qty: i.qty, packUnit: i.pack })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Não foi possível enviar o pedido.'); return; }
      setCarrinho({}); setNota(''); setEtapa('INICIO');
      router.refresh();
      /* O carrinho pode virar DOIS pedidos — um da Fábrica e um do CD. Dizer
         "pedido nº X enviado ao CD" quando saíram dois deixaria o gerente
         procurando o outro número. */
      const pedidos: { number: number; origin: string }[] = d.pedidos ?? [];
      const partes = pedidos.map((p) => `nº ${p.number} ${p.origin === 'CD' ? 'ao CD' : 'à Fábrica'}`);
      setAviso(
        (partes.length > 1 ? `Pedido dividido por destino: ${partes.join(' e ')}.` : `Pedido ${partes[0] ?? ''} enviado.`) +
        (d.semSetor > 0 ? ` ${d.semSetor} item(ns) do CD estão sem setor cadastrado e não foram direcionados a ninguém.` : ''),
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
                const c: Record<string, ItemNoCarrinho> = {};
                for (const s of sugestoes) c[s.productId] = { qty: s.qtySugerida, pack: 'UN' };
                setCarrinho(c); setEtapa('MONTANDO');
              }}
            >
              Montar pedido sugerido
            </Button>
          </div>
        )}

        <div>
          <p className="mb-1 text-sm font-semibold text-ink-900">Últimos pedidos</p>
          {/* ── O pedido que ainda está em curso ──
              Fica em destaque, e não perdido na lista: quem abre esta tela com
              pedido aberto quer saber ONDE ELE ESTÁ antes de fazer outro. */}
          {emCurso && (
            <Link href={`/modulos/produtos/pedido/${emCurso.id}`} className="mb-3 block">
              <div className="rounded-lg border-2 border-brand bg-brand-tint p-3">
                <p className="sgo-type-11 font-semibold text-brand">Pedido em andamento</p>
                <p className="font-bold text-ink-900">{emCurso.etiqueta}</p>
                <p className="text-sm text-ink-700">{emCurso.statusLabel}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${emCurso.itens > 0 ? Math.round((emCurso.separados / emCurso.itens) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-medium text-ink-700">
                    {emCurso.separados}/{emCurso.itens} itens separados
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-brand">Acompanhar →</p>
              </div>
            </Link>
          )}

          <Link href="/modulos/produtos/historico" className="mb-2 block text-sm font-semibold text-brand">
            Ver histórico completo →
          </Link>

          {recentes.length === 0 ? (
            <p className="text-sm text-ink-500">Nenhum pedido ainda.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border">
              {recentes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  {/* O numero leva ao acompanhamento: "onde esta meu pedido?" e a
                      pergunta que traz o gerente de volta a esta tela. */}
                  <Link href={`/modulos/produtos/pedido/${r.id}`} className="min-w-0">
                    <b className="text-ink-900">{r.etiqueta}</b>
                    <span className="block text-[11px] text-ink-500">{r.quando} · {r.itens} item(ns)</span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-semibold text-ink-700">{r.statusLabel}</span>
                    <Button variant="outline" size="sm" onClick={() => repetir(r.id)} disabled={busy}>
                      <RotateCcw className="h-4 w-4" /><span className="ml-1">Repetir</span>
                    </Button>
                  </span>
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
          {/* O destino sai dos PRODUTOS do carrinho. Dizia sempre "Centro de
              Distribuição", mesmo num carrinho só da Fábrica. */}
          <p className="text-xs text-ink-700">Unidade: {unitName} · Destino: {destinos.rotulo} · {totalItens} produto(s)</p>
        </div>

        <ul className="divide-y divide-line rounded-lg border">
          {itens.map(([id, q]) => {
            const p = porId.get(id);
            return (
              <li key={id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink-900">{p?.name ?? id}</span>
                {/* "2 fardos", e não "2 un": é o que quem separa vai ler. */}
                <span className="shrink-0 tabular-nums text-ink-700">{rotuloDaQuantidade(q.qty, q.pack, p?.measure)}</span>
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
              <Send className="h-5 w-5" /> {busy ? 'Enviando…' : `Enviar pedido ${destinos.preposicao}`}
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
                <span className="w-8 text-center text-sm font-semibold tabular-nums">{carrinho[p.id]?.qty ?? 0}</span>
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
            {itens.map(([id, item]) => {
              const p = porId.get(id);
              return (
                <li key={id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-ink-900">{p?.name ?? id}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => somar(id, -1)} aria-label="Diminuir"><Minus className="h-4 w-4" /></Button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.qty}</span>
                      <Button size="sm" variant="ghost" onClick={() => somar(id, 1)} aria-label="Aumentar"><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {/* A embalagem fica NA LINHA do produto, logo abaixo da
                      quantidade: quatro botões numa tira, um toque, sem abrir
                      nada. Modal ou seletor suspenso custaria dois toques por
                      item, e o gerente faz isso trinta vezes seguidas. */}
                  <TiraDeEmbalagem valor={item.pack} onEscolher={(u) => trocarEmbalagem(id, u)} />
                  <p className="mt-1 text-[11px] text-ink-500">
                    Pedido: <b className="text-ink-900">{rotuloDaQuantidade(item.qty, item.pack, p?.measure)}</b>
                  </p>
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
