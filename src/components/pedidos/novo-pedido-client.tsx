'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/ds/select';
import { Textarea } from '@/components/ui/ds/field';
import { SgoField } from '@/components/sgo/sgo-modal';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { shortUnitName } from '@/lib/unit-name';
import { agruparPorDestino, linhasDoTexto, MAX_OBSERVACAO, type SetorParaPedido } from '@/lib/pedidos/regras';

/**
 * Novo pedido por setor (v1.185.0 · v1.187.0): um campo de texto por setor
 * (uma linha por item), os setores agrupados pelo DESTINO que o cadastro
 * define (Fábrica · CD · Almoxarifado) — o gerente não escolhe destino — e a
 * observação. Nada é obrigatório além da unidade (decisão do Pedro, 04/11).
 */
export function NovoPedidoClient({ units, setores, unitPadrao }: { units: { id: string; name: string }[]; setores: SetorParaPedido[]; unitPadrao: string }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(unitPadrao || units[0]?.id || '');
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [observacao, setObservacao] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const grupos = useMemo(() => agruparPorDestino(setores), [setores]);
  const itens = useMemo(() => setores.reduce((n, s) => n + linhasDoTexto(textos[s.id]).length, 0), [setores, textos]);
  const comItem = useMemo(() => setores.filter((s) => linhasDoTexto(textos[s.id]).length > 0), [setores, textos]);
  const destinos = useMemo(() => agruparPorDestino(comItem).map((g) => g.rotulo), [comItem]);
  const pronto = Boolean(unitId) && !busy;

  async function enviar() {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'enviar', unitId, textos, observacao }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Falha ao enviar'); return; }
      router.push(`/modulos/pedidos/${d.id}?enviado=1`);
      router.refresh();
    } catch { setErro('Falha de conexão'); } finally { setBusy(false); }
  }

  return (
    <form className="space-y-4" data-testid="novo-pedido" onSubmit={(e) => { e.preventDefault(); if (pronto) void enviar(); }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {units.length > 1 ? (
          <SgoField label="Unidade" required><Select aria-label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} /></SgoField>
        ) : (
          <SgoField label="Unidade"><p className="text-sm font-medium text-ink-900">{shortUnitName(units[0]?.name ?? '—')}</p></SgoField>
        )}
      </div>

      {grupos.map((g) => (
        <section key={g.destino} className="space-y-2" data-testid={`grupo-${g.destino}`}>
          <h2 className="sgo-type-13 font-semibold text-brand">{g.rotulo.toUpperCase()} <span className="font-normal text-ink-500">· {g.setores.length} setor(es)</span></h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {g.setores.map((s) => {
              const n = linhasDoTexto(textos[s.id]).length;
              return (
                <Card key={s.id}>
                  <PanelHeader title={s.name.toUpperCase()} count={n || undefined} />
                  <div className="p-3">
                    <Textarea
                      aria-label={`Itens de ${s.name}`}
                      rows={5}
                      value={textos[s.id] ?? ''}
                      onChange={(e) => setTextos((t) => ({ ...t, [s.id]: e.target.value }))}
                      placeholder={'Uma linha por item, ex.:\n2 cxs alcatra\n1 cx maminha'}
                      className="font-mono text-sm"
                      data-testid={`texto-${s.id}`}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
      {setores.length === 0 && <p className="text-sm text-ink-500">Nenhum setor ativo cadastrado. Peça ao Administrador para cadastrar em Configurações → Setores do CD.</p>}

      <SgoField label="Observação geral" hint={`Opcional, até ${MAX_OBSERVACAO} caracteres — data de entrega, urgência, recado.`}>
        <Textarea aria-label="Observação" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value.slice(0, MAX_OBSERVACAO))} />
      </SgoField>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
        <p className="text-sm text-ink-700" data-testid="resumo-pedido">{itens === 0 ? 'Nenhum item escrito ainda — o pedido vai com a observação.' : `${itens} item(ns) em ${comItem.length} setor(es) → ${destinos.join(' · ')}. Cada setor chega ao seu destino.`}</p>
        <Button type="submit" disabled={!pronto} data-testid="btn-enviar"><Send className="h-4 w-4" /> {busy ? 'Enviando…' : 'Enviar pedido'}</Button>
      </div>
      {erro && <p className="text-sm font-medium text-danger" data-testid="erro-pedido">{erro}</p>}
    </form>
  );
}
