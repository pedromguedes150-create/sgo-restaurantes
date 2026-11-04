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
import { DESTINOS, linhasDoTexto, MAX_OBSERVACAO, type SetorParaPedido } from '@/lib/pedidos/regras';

/**
 * Novo pedido por setor (v1.185.0): destino, um campo de texto por setor
 * (uma linha por item) e observação. Simples de propósito — é a lista que o
 * gerente já escrevia no WhatsApp, só que chegando no setor certo.
 */
export function NovoPedidoClient({ units, setores, unitPadrao }: { units: { id: string; name: string }[]; setores: SetorParaPedido[]; unitPadrao: string }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(unitPadrao || units[0]?.id || '');
  const [destino, setDestino] = useState<'CD' | 'FABRICA'>('CD');
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [observacao, setObservacao] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const itens = useMemo(() => setores.reduce((n, s) => n + linhasDoTexto(textos[s.id]).length, 0), [setores, textos]);
  const setoresComItem = useMemo(() => setores.filter((s) => linhasDoTexto(textos[s.id]).length > 0).length, [setores, textos]);
  const pronto = Boolean(unitId) && itens > 0 && !busy;

  async function enviar() {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'enviar', unitId, destino, textos, observacao }) });
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
        <SgoField label="Destino" required><Select aria-label="Destino" value={destino} onValueChange={(v) => setDestino(v as 'CD' | 'FABRICA')} options={DESTINOS.map((d) => ({ value: d.key, label: d.rotulo }))} /></SgoField>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {setores.map((s) => {
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
      {setores.length === 0 && <p className="text-sm text-ink-500">Nenhum setor ativo cadastrado. Peça ao Administrador para cadastrar em Configurações → Setores do CD.</p>}

      <SgoField label="Observação geral" hint={`Opcional, até ${MAX_OBSERVACAO} caracteres — data de entrega, urgência, recado.`}>
        <Textarea aria-label="Observação" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value.slice(0, MAX_OBSERVACAO))} />
      </SgoField>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
        <p className="text-sm text-ink-700" data-testid="resumo-pedido">{itens === 0 ? 'Escreva pelo menos um item em algum setor.' : `${itens} item(ns) em ${setoresComItem} setor(es) — só os setores com itens vão no pedido.`}</p>
        <Button type="submit" disabled={!pronto} data-testid="btn-enviar"><Send className="h-4 w-4" /> {busy ? 'Enviando…' : 'Enviar pedido'}</Button>
      </div>
      {erro && <p className="text-sm font-medium text-danger" data-testid="erro-pedido">{erro}</p>}
    </form>
  );
}
