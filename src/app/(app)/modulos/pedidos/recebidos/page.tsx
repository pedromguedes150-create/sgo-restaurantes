import { Inbox, PackageCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { listarRecebidos } from '@/lib/pedidos/pedidos';
import { normalizarDestino, podeAtender } from '@/lib/pedidos/regras';
import { LargeTitle } from '@/components/layout/page-chrome';
import { RecebidosClient } from '@/components/pedidos/recebidos-client';

export const dynamic = 'force-dynamic';

/**
 * CAIXA DE ENTRADA do CD/Fábrica (v1.185.0): o separador vê os blocos do seu
 * setor; Admin/CEO veem tudo. Abertos = ainda não atendidos.
 */
export default async function PedidosRecebidosPage({ searchParams }: { searchParams: { situacao?: string; destino?: string } }) {
  const user = (await getSessionUser())!;
  const atendidos = searchParams.situacao === 'atendidos';
  const destino = normalizarDestino(searchParams.destino) ?? undefined;
  const [pedidos, podeEditar] = await Promise.all([listarRecebidos(user, { abertos: !atendidos, destino }), canEditModule(user.role, 'ORDERS_INBOX')]);
  const link = (s: string, d?: string) => `/modulos/pedidos/recebidos?situacao=${s}${d ? `&destino=${d}` : ''}`;

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Pedidos recebidos"
        subtitle={user.role === 'SEPARATOR' ? 'Os pedidos das unidades com itens do seu setor. Marque Recebido quando ler e Atendido quando separar.' : 'Tudo que as unidades pediram ao CD e à Fábrica, por setor.'}
        tabs={[
          { label: 'Abertos', icon: <Inbox className="h-3.5 w-3.5" />, href: link('abertos', destino), active: !atendidos, testId: 'aba-abertos' },
          { label: 'Atendidos', icon: <PackageCheck className="h-3.5 w-3.5" />, href: link('atendidos', destino), active: atendidos, testId: 'aba-atendidos' },
        ]}
      />
      {user.role !== 'SEPARATOR' && (
        <div className="sgo-filtros -mx-4">
          <span className="sgo-label">Destino</span>
          <span className="inline-flex gap-1">
            <a className={`sgo-btn sgo-btn--sm${!destino ? ' sgo-btn--primary' : ''}`} href={link(atendidos ? 'atendidos' : 'abertos')}>Todos</a>
            <a className={`sgo-btn sgo-btn--sm${destino === 'CD' ? ' sgo-btn--primary' : ''}`} href={link(atendidos ? 'atendidos' : 'abertos', 'CD')}>CD</a>
            <a className={`sgo-btn sgo-btn--sm${destino === 'FABRICA' ? ' sgo-btn--primary' : ''}`} href={link(atendidos ? 'atendidos' : 'abertos', 'FABRICA')}>Fábrica</a>
          </span>
        </div>
      )}
      <RecebidosClient pedidos={pedidos} podeMarcar={podeAtender(user.role) && podeEditar} />
    </div>
  );
}
