'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Check, Inbox, PackageCheck, PackageOpen, Printer, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/ds/select';
import { Card } from '@/components/sgo/panel';
import { BlocosDoPedido, CabecalhoDoPedido } from '@/components/pedidos/bloco-do-pedido';
import { rotuloDoDestino, type SetorParaPedido } from '@/lib/pedidos/regras';
import type { PedidoDaTela, SecaoDoPedido } from '@/lib/pedidos/pedidos';

/**
 * Caixa de entrada do CD/Fábrica/Almoxarifado (v1.185.0 · v1.188.0 · v1.189.0):
 * cada pedido com os blocos do(s) setor(es) de quem olha (o Admin vê todos), os
 * botões "Em separação" / "Atendido" por bloco, Abrir / Imprimir por pedido e,
 * em cada linha, "Mover" — o item escrito no setor errado vai para o setor
 * certo do mesmo pedido, e o separador de lá é avisado. O pedido atendido NÃO
 * some: fica na lista com a situação. Marcar e mover são da lib: o separador
 * só mexe nos setores dele.
 */
export function RecebidosClient({ pedidos, podeMarcar, setores }: { pedidos: PedidoDaTela[]; podeMarcar: boolean; setores: SetorParaPedido[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function chamar(body: Record<string, unknown>, chave: string) {
    setBusy(chave); setErro(null);
    try {
      const res = await fetch('/api/pedidos/recebidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Falha'); return false; }
      router.refresh();
      return true;
    } catch { setErro('Falha de conexão'); return false; } finally { setBusy(''); }
  }

  if (pedidos.length === 0) {
    return <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-500" data-testid="sem-pedidos"><Inbox className="mx-auto mb-1 h-5 w-5" /> Nenhum pedido nesta situação.</p>;
  }
  return (
    <div className="space-y-3" data-testid="recebidos">
      {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
      {pedidos.map((p) => (
        <Card key={p.id} className="p-3 sm:p-4" data-testid="pedido-recebido">
          <CabecalhoDoPedido pedido={p} />
          <div className="mt-2 flex flex-wrap gap-2 print:hidden">
            <Link href={`/modulos/pedidos/recebidos/${p.id}`} className="sgo-btn sgo-btn--sm" data-testid={`abrir-${p.id}`}><ExternalLink className="h-3.5 w-3.5" /> Abrir</Link>
            <Link href={`/modulos/pedidos/recebidos/${p.id}?imprimir=1`} target="_blank" className="sgo-btn sgo-btn--sm" data-testid={`imprimir-${p.id}`}><Printer className="h-3.5 w-3.5" /> Imprimir</Link>
          </div>
          <div className="mt-3">
            <BlocosDoPedido
              pedido={p}
              acoesDaSecao={podeMarcar ? (s) => (
                <span className="inline-flex gap-1">
                  {s.status === 'ENVIADO' && <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => chamar({ acao: 'separar', sectionId: s.id }, s.id)} data-testid={`separar-${s.id}`}><PackageOpen className="h-3.5 w-3.5" /> Em separação</Button>}
                  {s.status !== 'ATENDIDO' && <Button size="sm" disabled={busy !== ''} onClick={() => chamar({ acao: 'atender', sectionId: s.id }, s.id)} data-testid={`atender-${s.id}`}><PackageCheck className="h-3.5 w-3.5" /> Atendido</Button>}
                </span>
              ) : undefined}
              acaoDaLinha={podeMarcar && setores.length > 1 ? (s, i) => (s.status === 'ATENDIDO' ? null : (
                <MoverLinha secao={s} indice={i} setores={setores} busy={busy !== ''} onMover={(paraSectorId) => chamar({ acao: 'mover', sectionId: s.id, linha: i, paraSectorId }, `${s.id}:${i}`)} />
              )) : undefined}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** "Mover" numa linha: abre a escolha do setor de destino (os outros setores ativos) e confirma. */
function MoverLinha({ secao, indice, setores, busy, onMover }: { secao: SecaoDoPedido; indice: number; setores: SetorParaPedido[]; busy: boolean; onMover: (paraSectorId: string) => Promise<boolean> }) {
  const [aberto, setAberto] = useState(false);
  const [alvo, setAlvo] = useState('');
  const opcoes = setores.filter((s) => s.id !== secao.sectorId).map((s) => ({ value: s.id, label: s.name, hint: rotuloDoDestino(s.destination) }));
  if (!aberto) {
    return <button type="button" className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-semibold text-brand hover:underline print:hidden" onClick={() => setAberto(true)} data-testid={`mover-${secao.id}-${indice}`} title="Este item está no setor errado? Mova para o setor certo"><ArrowRightLeft className="h-3 w-3" /> Mover</button>;
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 print:hidden" data-testid={`mover-form-${secao.id}-${indice}`}>
      <span className="w-56"><Select aria-label="Setor de destino" size="sm" value={alvo || null} onValueChange={setAlvo} placeholder="Para qual setor?" options={opcoes} searchable={opcoes.length > 6} /></span>
      <Button size="sm" disabled={busy || !alvo} onClick={async () => { if (await onMover(alvo)) { setAberto(false); setAlvo(''); } }} data-testid={`confirmar-mover-${secao.id}-${indice}`}><Check className="h-3.5 w-3.5" /> Mover</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setAberto(false); setAlvo(''); }} aria-label="Cancelar"><X className="h-3.5 w-3.5" /></Button>
    </span>
  );
}
