import { Inbox, LayoutList, PackageCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { listarRecebidos, setoresParaPedido, type SituacaoDaCaixa } from '@/lib/pedidos/pedidos';
import { DESTINOS, normalizarDestino, podeAtender } from '@/lib/pedidos/regras';
import { LargeTitle } from '@/components/layout/page-chrome';
import { RecebidosClient } from '@/components/pedidos/recebidos-client';

export const dynamic = 'force-dynamic';

/**
 * CAIXA DE ENTRADA do CD/Fábrica/Almoxarifado (v1.185.0 · v1.188.0): o
 * separador vê os blocos do seu setor; Admin/CEO veem tudo. A aba padrão é
 * TODOS — o pedido atendido não some da lista (decisão do Pedro); "Em aberto"
 * e "Atendidos" são recortes.
 */
export default async function PedidosRecebidosPage({ searchParams }: { searchParams: { situacao?: string; destino?: string } }) {
  const user = (await getSessionUser())!;
  const situacao: SituacaoDaCaixa = searchParams.situacao === 'abertos' ? 'abertos' : searchParams.situacao === 'atendidos' ? 'atendidos' : 'todos';
  const destino = normalizarDestino(searchParams.destino) ?? undefined;
  const [pedidos, podeEditar, setores] = await Promise.all([listarRecebidos(user, { situacao, destino }), canEditModule(user.role, 'ORDERS_INBOX'), setoresParaPedido()]);
  const link = (s: string, d?: string) => `/modulos/pedidos/recebidos?situacao=${s}${d ? `&destino=${d}` : ''}`;

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Pedidos recebidos"
        subtitle={user.role === 'SEPARATOR' ? 'Os pedidos das unidades com itens do seu setor. Marque "Em separação" ao começar (o gerente deixa de poder alterar) e "Atendido" ao terminar. Abrir mostra o pedido inteiro; Imprimir gera a folha.' : 'Tudo que as unidades pediram à Fábrica, ao CD e ao Almoxarifado, por setor.'}
        tabs={[
          { label: 'Todos', icon: <LayoutList className="h-3.5 w-3.5" />, href: link('todos', destino), active: situacao === 'todos', testId: 'aba-todos' },
          { label: 'Em aberto', icon: <Inbox className="h-3.5 w-3.5" />, href: link('abertos', destino), active: situacao === 'abertos', testId: 'aba-abertos' },
          { label: 'Atendidos', icon: <PackageCheck className="h-3.5 w-3.5" />, href: link('atendidos', destino), active: situacao === 'atendidos', testId: 'aba-atendidos' },
        ]}
      />
      {user.role !== 'SEPARATOR' && (
        <div className="sgo-filtros -mx-4">
          <span className="sgo-label">Destino</span>
          <span className="inline-flex gap-1">
            <a className={`sgo-btn sgo-btn--sm${!destino ? ' sgo-btn--primary' : ''}`} href={link(situacao)}>Todos</a>
            {DESTINOS.map((d) => <a key={d.key} className={`sgo-btn sgo-btn--sm${destino === d.key ? ' sgo-btn--primary' : ''}`} href={link(situacao, d.key)}>{d.curto}</a>)}
          </span>
        </div>
      )}
      <RecebidosClient pedidos={pedidos} podeMarcar={podeAtender(user.role) && podeEditar} setores={setores} />
    </div>
  );
}
