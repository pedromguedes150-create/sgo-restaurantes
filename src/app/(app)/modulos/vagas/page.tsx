import Link from 'next/link';
import { BarChart3, List, Plus } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { ListaDeVagas } from '@/components/vagas/lista-vagas';
import { PainelDeVagas } from '@/components/vagas/painel-vagas';
import { listarVagas, permissoesDeVagas } from '@/lib/vagas/dados';
import { lerPeriodo, montarPainel, noPeriodo, PERIODOS } from '@/lib/vagas/painel';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

/**
 * SOLICITAÇÃO DE VAGAS (v1.227.0) — o padrão do Grupo Beija-Flor, igual ao do
 * SGO dos postos. Lista | Painel: os dois leem a MESMA lista, já recortada pelo
 * alcance de unidades do usuário.
 */
export default async function VagasPage({ searchParams }: { searchParams: { visao?: string; periodo?: string; unidade?: string } }) {
  const user = (await getSessionUser())!;
  const perm = await permissoesDeVagas(user);
  if (!perm.ver) return <p className="text-sm text-ink-500">Você não tem acesso à Solicitação de Vagas.</p>;

  const [vagas, unidades] = await Promise.all([
    listarVagas(user),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const painel = searchParams.visao === 'painel';
  const periodo = lerPeriodo(searchParams.periodo);
  const unidade = unidades.some((u) => u.id === searchParams.unidade) ? searchParams.unidade! : '';
  const agora = new Date();
  const link = (m: Record<string, string>) => { const q = new URLSearchParams({ visao: 'painel', periodo, ...(unidade ? { unidade } : {}), ...m }); return `/modulos/vagas?${q.toString()}`; };

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Solicitação de Vagas"
        subtitle="O gerente pede, o supervisor aprova em até 1 dia útil, o SGO envia ao RH e o RH devolve cada passo."
        tabs={[
          { label: 'Lista', icon: <List className="h-3.5 w-3.5" />, href: '/modulos/vagas', active: !painel, testId: 'visao-lista' },
          { label: 'Painel', icon: <BarChart3 className="h-3.5 w-3.5" />, href: link({}), active: painel, testId: 'visao-painel' },
        ]}
        actions={perm.pedir ? <Link href="/modulos/vagas/nova" className="sgo-btn sgo-btn--primary" data-testid="nova-vaga"><Plus className="h-4 w-4" /> Nova vaga</Link> : undefined}
      />

      {painel ? (
        <>
          <div className="sgo-filtros -mx-4 px-4">
            <span className="sgo-label">Período (data do pedido)</span>
            <SegmentedNav aria-label="Período do painel" value={periodo} options={PERIODOS.map((p) => ({ value: p.value, label: p.label, href: link({ periodo: p.value }) }))} />
            {unidades.length > 1 && (
              <>
                <span className="sgo-label">Unidade</span>
                <UnitSelectNav paramName="unidade" units={[{ id: '', name: 'Todas as unidades' }, ...unidades.map((u) => ({ id: u.id, name: shortUnitName(u.name) }))]} selected={unidade} />
              </>
            )}
          </div>
          <PainelDeVagas p={montarPainel(vagas.filter((v) => noPeriodo(v, periodo, agora) && (!unidade || v.unitId === unidade)), agora)} />
        </>
      ) : (
        <ListaDeVagas vagas={vagas} aprovador={perm.aprovar} agoraISO={agora.toISOString()} unidades={unidades} />
      )}
    </div>
  );
}
