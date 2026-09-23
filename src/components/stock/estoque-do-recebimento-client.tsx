'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackageCheck, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { emUnidades, type TipoDeEmbalagem } from '@/lib/stock/embalagem';

/**
 * "LANÇAR NO ESTOQUE" — o pedido recebido virando lotes da prateleira.
 *
 * Aparece no pedido já conferido pela unidade. Nada é lançado sozinho: a
 * entrada do estoque precisa da embalagem em que se conta e da VALIDADE quando
 * o produto a controla, e a conferência de recebimento não pergunta nenhuma
 * das duas. A quantidade vem SUGERIDA quando a embalagem pedida é a mesma do
 * estoque ("3 fardos" pedidos, produto contado em fardos); quando não é, o
 * campo vem vazio e o que foi recebido fica escrito ao lado como referência —
 * converter por um packSize que pode estar errado seria inventar saldo.
 *
 * Cada item é um toque. O que já foi lançado aparece marcado e não oferece o
 * botão: o servidor também recusa o segundo lançamento, mas a tela não deve
 * convidar a tentar.
 */
export interface ItemParaEstoqueUI {
  itemId: string;
  productId: string;
  nome: string;
  recebido: string;
  tipoDoEstoque: TipoDeEmbalagem;
  rotuloDoEstoque: string;
  unitsPerPack: number;
  quantidadeSugerida: number | null;
  exigeValidade: boolean;
  lancadoEm: string | null;
  bloqueio: 'PRODUTO_INATIVO' | null;
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
  const r = await fetch('/api/estoque', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: 'Falha de comunicação.' }));
}

export function EstoqueDoRecebimentoClient({ requestId, unitId, itens }: { requestId: string; unitId: string; itens: ItemParaEstoqueUI[] }) {
  const pendentes = itens.filter((i) => !i.lancadoEm && !i.bloqueio);
  const lancados = itens.filter((i) => i.lancadoEm);
  const [aberto, setAberto] = useState(pendentes.length > 0 && pendentes.length <= 6);

  if (itens.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow-sgo-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-medium text-ink-900"><PackageCheck className="h-4 w-4 text-brand" /> Lançar no estoque</p>
          <p className="sgo-type-13 text-ink-700">
            {pendentes.length === 0
              ? `Todos os ${lancados.length} item(ns) deste recebimento já estão no estoque da unidade.`
              : `${pendentes.length} item(ns) recebidos ainda não estão no estoque. Confirme a quantidade${pendentes.some((i) => i.exigeValidade) ? ' e a validade do lote' : ''} — nada é lançado sozinho.`}
          </p>
        </div>
        {pendentes.length > 0 && (
          <Button size="sm" variant={aberto ? 'outline' : 'default'} onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Recolher' : `Lançar ${pendentes.length} item(ns)`}
          </Button>
        )}
      </div>

      {aberto && pendentes.length > 0 && (
        <ul className="divide-y divide-line">
          {pendentes.map((i) => <LinhaParaLancar key={i.itemId} item={i} requestId={requestId} unitId={unitId} />)}
        </ul>
      )}

      {lancados.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-500">{lancados.length} já lançado(s)</summary>
          <ul className="mt-1 space-y-0.5 text-ink-700">
            {lancados.map((i) => (
              <li key={i.itemId} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> {i.nome} <span className="text-ink-500">· {i.recebido} · em {i.lancadoEm}</span></li>
            ))}
          </ul>
        </details>
      )}
      {itens.some((i) => i.bloqueio) && (
        <p className="sgo-type-11 text-ink-500">Itens de produto desativado no catálogo não podem ser lançados: {itens.filter((i) => i.bloqueio).map((i) => i.nome).join(', ')}.</p>
      )}
    </div>
  );
}

function LinhaParaLancar({ item, requestId, unitId }: { item: ItemParaEstoqueUI; requestId: string; unitId: string }) {
  const router = useRouter();
  const [quantidade, setQuantidade] = useState(item.quantidadeSugerida !== null ? String(item.quantidadeSugerida) : '');
  const [validade, setValidade] = useState<string | null>(null);
  const [lotCode, setLotCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(false);

  const qtd = Number(quantidade.replace(',', '.'));
  const unidades = Number.isFinite(qtd) && qtd > 0 ? emUnidades(qtd, item.tipoDoEstoque, item.unitsPerPack) : 0;
  const podeLancar = unidades > 0 && (!item.exigeValidade || !!validade);

  async function lancar() {
    setBusy(true); setErro('');
    const r = await post({
      action: 'entrada', unitId, productId: item.productId, quantidade: qtd,
      expiresAt: validade, lotCode: lotCode.trim() || null, requestItemId: item.itemId,
      note: 'Recebido da Fábrica/CD',
    });
    setBusy(false);
    if (!r.ok) { setErro(String(r.error ?? 'Falha ao lançar.')); return; }
    setFeito(true);
    router.refresh();
  }

  if (feito) {
    return (
      <li className="flex items-center gap-2 py-2 text-sm text-ink-700">
        <Check className="h-4 w-4 text-success" /> <b>{item.nome}</b> lançado no estoque.
      </li>
    );
  }

  return (
    <li className="space-y-2 py-3" data-request={requestId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{item.nome}</p>
          <p className="sgo-type-11 text-ink-500">Recebido: {item.recebido}{item.quantidadeSugerida === null ? ` — informe em ${item.rotuloDoEstoque}` : ''}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <Label htmlFor={`q-${item.itemId}`} className="text-xs">Quantidade ({item.rotuloDoEstoque})</Label>
          <Input id={`q-${item.itemId}`} inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="0" className="mt-1 h-9 text-sm" />
          {item.tipoDoEstoque !== 'UN' && unidades > 0 && <p className="sgo-type-11 mt-0.5 text-ink-500">= {unidades.toLocaleString('pt-BR')} unidades</p>}
        </div>
        {item.exigeValidade && (
          <DatePicker label="Validade do lote" size="sm" required value={validade} onValueChange={setValidade} aria-label={`Validade de ${item.nome}`} />
        )}
        <div>
          <Label htmlFor={`l-${item.itemId}`} className="text-xs">Lote (opcional)</Label>
          <Input id={`l-${item.itemId}`} value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="Código na embalagem" className="mt-1 h-9 text-sm" />
        </div>
        <div className="flex items-end">
          <Button size="sm" className="w-full" disabled={busy || !podeLancar} onClick={() => void lancar()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Lançar
          </Button>
        </div>
      </div>
      {item.exigeValidade && !validade && <p className="sgo-type-11 text-ink-500">Este produto controla validade — o lote só entra com a data.</p>}
      {erro && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{erro}</p>}
    </li>
  );
}
