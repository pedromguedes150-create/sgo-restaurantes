import Link from 'next/link';
import { Inbox, PenLine, Send } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { canEditModule } from '@/lib/permissions';
import { permissaoDeRota } from '@/lib/permissions/links';
import { listarPedidosDaUnidade, setoresParaPedido } from '@/lib/pedidos/pedidos';
import { dataBR, podeEnviar, ROTULO_STATUS, rotuloDoDestino, TOM_STATUS } from '@/lib/pedidos/regras';
import { LargeTitle } from '@/components/layout/page-chrome';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { NovoPedidoClient } from '@/components/pedidos/novo-pedido-client';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';
const TODAS = 'todas';

/**
 * PEDIDOS POR SETOR (v1.185.0): a lista escrita que a unidade manda ao CD ou
 * à Fábrica, um bloco por setor. Aba "Novo pedido" e "Enviados" (com situação).
 */
export default async function PedidosPage({ searchParams }: { searchParams: { aba?: string; unit?: string } }) {
  const user = (await getSessionUser())!;
  const aba = searchParams.aba === 'enviados' ? 'enviados' : 'novo';
  const [units, setores, podeEditar, permite] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    setoresParaPedido(),
    canEditModule(user.role, 'ORDERS'),
    permissaoDeRota(user.role),
  ]);
  const unitFiltro = searchParams.unit && searchParams.unit !== TODAS && units.some((u) => u.id === searchParams.unit) ? searchParams.unit : '';
  const pedidos = aba === 'enviados' ? await listarPedidosDaUnidade(user, unitFiltro || undefined) : [];
  const podeNovo = podeEnviar(user.role) && podeEditar;
  const link = (a: string) => `/modulos/pedidos?aba=${a}${unitFiltro ? `&unit=${unitFiltro}` : ''}`;

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Pedidos"
        subtitle="A lista do que a unidade precisa, como um e-mail: escolha o destino (CD ou Fábrica), escreva uma linha por item em cada setor e envie. Cada bloco chega ao separador do setor, que marca Recebido e Atendido."
        tabs={[
          { label: 'Novo pedido', icon: <PenLine className="h-3.5 w-3.5" />, href: link('novo'), active: aba === 'novo', testId: 'aba-novo' },
          { label: 'Enviados', icon: <Send className="h-3.5 w-3.5" />, href: link('enviados'), active: aba === 'enviados', testId: 'aba-enviados' },
        ]}
        actions={permite('/modulos/pedidos/recebidos') ? <Link href="/modulos/pedidos/recebidos" className="sgo-btn"><Inbox className="h-3.5 w-3.5" /> Caixa de entrada (CD/Fábrica)</Link> : undefined}
      />

      {aba === 'novo' ? (
        podeNovo ? <NovoPedidoClient units={units} setores={setores} unitPadrao={unitFiltro || units[0]?.id || ''} /> : <p className="text-sm text-ink-500">Seu perfil só consulta os pedidos enviados.</p>
      ) : (
        <>
          {units.length > 1 && (
            <div className="sgo-filtros -mx-4">
              <span className="sgo-label">Unidade</span>
              <UnitSelectNav units={[{ id: TODAS, name: 'Todas as unidades' }, ...units.map((u) => ({ id: u.id, name: shortUnitName(u.name) }))]} selected={unitFiltro || TODAS} />
            </div>
          )}
          <Card>
            <PanelHeader title="Pedidos enviados" count={pedidos.length} icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><Send className="h-4 w-4" /></span>} />
            <div className="overflow-x-auto p-2">
              {pedidos.length === 0 ? <p className="p-3 text-sm text-ink-500">Nenhum pedido enviado ainda.</p> : (
                <table className="sgo-tbl w-full text-sm" data-testid="tabela-pedidos">
                  <thead><tr><th className="text-left">Nº</th><th className="text-left">Enviado</th>{units.length > 1 && <th className="text-left">Unidade</th>}<th className="text-left">Destino</th><th className="text-left">Setores</th><th className="text-left">Por</th><th className="text-left">Situação</th></tr></thead>
                  <tbody>
                    {pedidos.map((p) => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap font-semibold"><Link href={`/modulos/pedidos/${p.id}`} className="text-brand underline-offset-2 hover:underline">nº {p.number}</Link></td>
                        <td className="whitespace-nowrap tabular-nums">{dataBR(p.sentAt)}</td>
                        {units.length > 1 && <td className="whitespace-nowrap">{shortUnitName(p.unitName)}</td>}
                        <td className="whitespace-nowrap">{rotuloDoDestino(p.destino)}</td>
                        <td className="whitespace-normal text-xs">{p.secoes.map((s) => `${s.sectorName} (${s.lines.length}${s.status === 'ATENDIDO' ? ' ✓' : ''})`).join(' · ')}</td>
                        <td className="whitespace-nowrap">{p.createdByName}</td>
                        <td className="whitespace-nowrap"><StatusBadge tone={TOM_STATUS[p.status]} dot>{ROTULO_STATUS[p.status]}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
