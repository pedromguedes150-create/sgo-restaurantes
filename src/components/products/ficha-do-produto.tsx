'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Barcode, Check, Plus, Star, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/ds/sheet';
import { Button } from '@/components/ui/ds/button';
import { Input, Textarea } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { buscarProdutos } from '@/lib/products/busca';
import type { FichaDoProduto } from '@/lib/products/ficha';

/**
 * A FICHA DO PRODUTO — [VER / EDITAR] no catálogo.
 *
 * Dados principais e embalagem num formulário; os CÓDIGOS num bloco próprio,
 * porque é neles que mora a correção mais comum: um gerente vinculou o código
 * ao açúcar cristal e era do refinado. Aqui se remove ou se TRANSFERE o
 * código para o produto certo, com motivo, e o histórico dos dois produtos
 * registra. Pedidos já gravados não mudam — a ficha diz isso na tela.
 */

interface ProdutoResumido { id: string; name: string; category: string; measure: string; barcode?: string | null; barcodes?: string[] }

const MEDIDAS = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'dz', 'fardo', 'caixa'];
const ORIGENS = [{ value: 'FABRICA', label: 'Fábrica' }, { value: 'CD', label: 'Centro de Distribuição' }, { value: 'LOCAL', label: 'Compra local da unidade' }];
const EMBALAGENS = [{ value: 'UN', label: 'Unidade' }, { value: 'FARDO', label: 'Fardo' }, { value: 'DISPLAY', label: 'Display' }];

export function FichaDoProdutoSheet({ productId, onClose, setores, produtos }: {
  productId: string | null;
  onClose: () => void;
  setores: { id: string; name: string }[];
  /** O catálogo inteiro (para a busca de destino da transferência). */
  produtos: ProdutoResumido[];
}) {
  const router = useRouter();
  const [ficha, setFicha] = useState<FichaDoProduto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: '', category: '', measure: 'un', origin: 'CD', cdSectorId: '' as string | null, packType: 'UN', packSize: '' });
  const [novoCodigo, setNovoCodigo] = useState('');
  const [transferindo, setTransferindo] = useState<string | null>(null);
  const [destinoTermo, setDestinoTermo] = useState('');
  const [destino, setDestino] = useState<ProdutoResumido | null>(null);
  const [motivo, setMotivo] = useState('');

  const carregar = useCallback(async () => {
    if (!productId) return;
    setErro(null);
    const res = await fetch(`/api/products/ficha?id=${encodeURIComponent(productId)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setErro(body.error ?? 'Não foi possível abrir a ficha.'); return; }
    const f = body as FichaDoProduto;
    setFicha(f);
    setForm({ name: f.name, category: f.category, measure: f.measure, origin: f.origin, cdSectorId: f.cdSectorId, packType: f.packType, packSize: f.packSize ? String(f.packSize) : '' });
  }, [productId]);

  useEffect(() => { setFicha(null); setOk(null); setTransferindo(null); setDestino(null); setMotivo(''); void carregar(); }, [carregar]);

  async function post(body: Record<string, unknown>, sucesso: string) {
    setBusy(true); setErro(null); setOk(null);
    try {
      const res = await fetch('/api/products/ficha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: productId, ...body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Falha ao gravar.'); return false; }
      setOk(sucesso);
      await carregar();
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  const candidatos = useMemo(() => buscarProdutos(produtos.filter((p) => p.id !== productId), destinoTermo, 8), [produtos, destinoTermo, productId]);

  const aberto = Boolean(productId);
  return (
    <Sheet open={aberto} onClose={onClose} title={ficha ? ficha.name : 'Ficha do produto'} description={ficha ? `${ficha.origin === 'CD' ? 'Centro de Distribuição' : ficha.origin === 'FABRICA' ? 'Fábrica' : 'Compra local'} · ${ficha.category}` : undefined}>
      {!ficha && !erro && <p className="text-sm text-ink-500">Carregando…</p>}
      {erro && <Banner tone="danger" title={erro} onDismiss={() => setErro(null)} />}
      {ok && <Banner tone="success" title={ok} onDismiss={() => setOk(null)} />}

      {ficha && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={ficha.validation === 'PENDENTE' ? 'warning' : 'success'} dot>
              {ficha.validation === 'PENDENTE' ? 'Pendente de validação' : 'Validado'}
            </StatusBadge>
            <StatusBadge tone={ficha.active ? 'neutral' : 'danger'}>{ficha.active ? 'Ativo' : 'Desativado'}</StatusBadge>
            {ficha.createdByName && <span className="text-xs text-ink-500">cadastrado por {ficha.createdByName}</span>}
            {ficha.emPedidosAbertos > 0 && <span className="text-xs text-ink-500">· em {ficha.emPedidosAbertos} item(ns) de pedidos em curso</span>}
          </div>

          {/* ── DADOS PRINCIPAIS + EMBALAGEM ── */}
          <section className="space-y-2 rounded-card border border-line p-3">
            <p className="sgo-type-11 font-semibold text-ink-900">Dados principais</p>
            <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <Select label="Medida" value={form.measure} onValueChange={(v) => setForm({ ...form, measure: v })} options={MEDIDAS.map((m) => ({ value: m, label: m }))} />
              <Select label="Origem" value={form.origin} onValueChange={(v) => setForm({ ...form, origin: v, cdSectorId: v === 'CD' ? form.cdSectorId : null })} options={ORIGENS} />
              {form.origin === 'CD' && (
                <Select
                  label="Setor responsável pela separação" value={form.cdSectorId} placeholder="Sem setor"
                  onValueChange={(v) => setForm({ ...form, cdSectorId: v })}
                  options={setores.map((s) => ({ value: s.id, label: s.name }))}
                  hint="Qual área da Fábrica/CD separa este produto — não é a categoria comercial."
                  error={!form.cdSectorId ? 'Sem setor, o produto não chega a separador nenhum.' : undefined}
                />
              )}
            </div>
            <p className="sgo-type-11 pt-1 font-semibold text-ink-900">Embalagem</p>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Como é contado" value={form.packType} onValueChange={(v) => setForm({ ...form, packType: v, packSize: v === 'UN' ? '' : form.packSize })} options={EMBALAGENS} />
              {form.packType !== 'UN' && (
                <Input label={`Unidades por ${form.packType === 'FARDO' ? 'fardo' : 'display'}`} inputMode="numeric" value={form.packSize} onChange={(e) => setForm({ ...form, packSize: e.target.value.replace(/\D/g, '').slice(0, 4) })} hint={`Unidade base: ${form.measure}`} />
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button loading={busy} onClick={() => void post({ action: 'atualizar', name: form.name, category: form.category, measure: form.measure, origin: form.origin, cdSectorId: form.cdSectorId, packType: form.packType, packSize: form.packType === 'UN' ? null : Number(form.packSize) }, 'Dados salvos.')}>
                <Check className="h-4 w-4" /> Salvar
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => void post({ action: 'atualizar', active: !ficha.active }, ficha.active ? 'Produto desativado.' : 'Produto ativado.')}>
                {ficha.active ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          </section>

          {/* ── CÓDIGOS DE BARRAS ── */}
          <section className="space-y-2 rounded-card border border-line p-3">
            <p className="flex items-center gap-1.5 sgo-type-11 font-semibold text-ink-900"><Barcode className="h-4 w-4 text-brand" /> Códigos de barras ({ficha.codigos.length})</p>
            <p className="text-xs text-ink-500">Qualquer um destes códigos abre este produto no pedido. Corrigir aqui vale para os próximos pedidos; os já gravados não mudam.</p>
            {ficha.codigos.length === 0 && <p className="text-sm text-ink-500">Nenhum código vinculado.</p>}
            <ul className="divide-y divide-line">
              {ficha.codigos.map((c) => (
                <li key={c.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-mono text-sm text-ink-900">
                      {c.code}
                      {c.principal && <StatusBadge tone="brand">principal</StatusBadge>}
                      {!c.reviewedAt && <StatusBadge tone="warning" dot>novo — não revisado</StatusBadge>}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {!c.reviewedAt && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void post({ action: 'revisarCodigo', code: c.code }, 'Código marcado como revisado.')}>Revisado</Button>}
                      {!c.principal && <Button size="sm" variant="ghost" aria-label="Tornar principal" disabled={busy} onClick={() => void post({ action: 'addCodigo', code: c.code, principal: true }, 'Código principal alterado.')}><Star className="h-4 w-4" /></Button>}
                      <Button size="sm" variant="ghost" aria-label="Transferir para outro produto" disabled={busy} onClick={() => { setTransferindo(transferindo === c.code ? null : c.code); setDestino(null); setDestinoTermo(''); setMotivo(''); }}><ArrowRightLeft className="h-4 w-4" /></Button>
                      <Button size="sm" variant="danger" aria-label="Remover código" disabled={busy} onClick={() => { if (confirm(`Remover o código ${c.code} deste produto?`)) void post({ action: 'removerCodigo', code: c.code }, 'Código removido.'); }}><Trash2 className="h-4 w-4" /></Button>
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-500">{c.createdByName ? `vinculado por ${c.createdByName}` : 'vinculado'} em {new Date(c.createdAt).toLocaleDateString('pt-BR')}</p>

                  {transferindo === c.code && (
                    <div className="mt-2 space-y-2 rounded-lg border border-line bg-canvas p-2.5">
                      <p className="text-sm font-semibold text-ink-900">Transferir {c.code} para outro produto</p>
                      {!destino ? (
                        <>
                          <Input label="Produto de destino" value={destinoTermo} onChange={(e) => setDestinoTermo(e.target.value)} placeholder="digite o nome…" />
                          {destinoTermo.trim() && (
                            <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border bg-surface">
                              {candidatos.map((p) => (
                                <li key={p.id}>
                                  <button type="button" className="w-full px-3 py-2 text-left text-sm text-ink-900 hover:bg-sunken" onClick={() => setDestino(p)}>
                                    {p.name} <span className="text-xs text-ink-500">· {p.category}</span>
                                  </button>
                                </li>
                              ))}
                              {candidatos.length === 0 && <li className="px-3 py-2 text-sm text-ink-500">Nada encontrado.</li>}
                            </ul>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-ink-900">Para: <b>{destino.name}</b> <button type="button" className="ml-1 text-xs text-brand underline" onClick={() => setDestino(null)}>trocar</button></p>
                          <Textarea label="Motivo (fica no histórico)" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 300))} />
                          <div className="flex gap-2">
                            <Button loading={busy} onClick={async () => { const ok2 = await post({ action: 'transferirCodigo', code: c.code, toProductId: destino.id, reason: motivo }, `Código transferido para ${destino.name}.`); if (ok2) setTransferindo(null); }}>
                              <ArrowRightLeft className="h-4 w-4" /> Transferir
                            </Button>
                            <Button variant="secondary" onClick={() => setTransferindo(null)}>Cancelar</Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-end gap-2">
              <Input label="Adicionar código" inputMode="numeric" value={novoCodigo} onChange={(e) => setNovoCodigo(e.target.value.replace(/\D/g, '').slice(0, 20))} placeholder="789…" className="font-mono" />
              <Button variant="secondary" disabled={busy || novoCodigo.length < 6} onClick={async () => { const ok2 = await post({ action: 'addCodigo', code: novoCodigo }, 'Código adicionado.'); if (ok2) setNovoCodigo(''); }}>
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
          </section>

          {/* ── HISTÓRICO ── */}
          {ficha.historico.length > 0 && (
            <section className="space-y-1 rounded-card border border-line p-3">
              <p className="sgo-type-11 font-semibold text-ink-900">Histórico de códigos</p>
              <ul className="divide-y divide-line text-xs">
                {ficha.historico.map((h) => (
                  <li key={h.id} className="py-1.5">
                    <span className="font-mono text-ink-900">{h.code}</span>{' '}
                    <span className="text-ink-700">
                      {h.action === 'ADD' && <>adicionado a <b>{h.toProductName}</b></>}
                      {h.action === 'REMOVE' && <>removido de <b>{h.fromProductName}</b></>}
                      {h.action === 'TRANSFER' && <>transferido de <b>{h.fromProductName}</b> para <b>{h.toProductName}</b></>}
                    </span>
                    <span className="block text-ink-500">{h.userName} · {new Date(h.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{h.reason ? ` · ${h.reason}` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
