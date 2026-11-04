'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, PackageCheck, PackageOpen, Printer, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/sgo/panel';
import { BlocosDoPedido, CabecalhoDoPedido } from '@/components/pedidos/bloco-do-pedido';
import type { PedidoDaTela, SecaoDoPedido } from '@/lib/pedidos/pedidos';

/**
 * Caixa de entrada do CD/Fábrica/Almoxarifado (v1.185.0 · v1.188.0): cada
 * pedido com os blocos do setor de quem olha (o Admin vê todos), os botões
 * "Em separação" / "Atendido" por bloco, e Abrir / Imprimir por pedido. O
 * pedido atendido NÃO some: fica na lista com a situação (decisão do Pedro).
 * Marcar é da lib: o separador só mexe no setor dele.
 */
export function RecebidosClient({ pedidos, podeMarcar }: { pedidos: PedidoDaTela[]; podeMarcar: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function marcar(s: SecaoDoPedido, acao: 'separar' | 'atender') {
    setBusy(s.id); setErro(null);
    try {
      const res = await fetch('/api/pedidos/recebidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, sectionId: s.id }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Falha'); return; }
      router.refresh();
    } catch { setErro('Falha de conexão'); } finally { setBusy(''); }
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
                  {s.status === 'ENVIADO' && <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => marcar(s, 'separar')} data-testid={`separar-${s.id}`}><PackageOpen className="h-3.5 w-3.5" /> Em separação</Button>}
                  {s.status !== 'ATENDIDO' && <Button size="sm" disabled={busy !== ''} onClick={() => marcar(s, 'atender')} data-testid={`atender-${s.id}`}><PackageCheck className="h-3.5 w-3.5" /> Atendido</Button>}
                </span>
              ) : undefined}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
