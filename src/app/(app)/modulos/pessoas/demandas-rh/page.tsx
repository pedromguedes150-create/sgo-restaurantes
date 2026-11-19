import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canEditModule } from '@/lib/permissions';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { podeAba, podeEditarAba } from '@/lib/permissions/abas';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { LIMITE_DA_LISTA, listarDemandas } from '@/lib/rh/demandas';
import { montarPainel } from '@/lib/rh/solicitacoes-regras';
import { SolicitacoesRhClient, type AbaDaTela } from '@/components/people/solicitacoes-rh-client';

export const dynamic = 'force-dynamic';

/**
 * SOLICITAÇÕES AO RH (v1.217.0; "Demandas ao RH" desde a v1.168.0). Uma tela,
 * três abas: Minhas Solicitações (acompanhar), Nova Solicitação (abrir) e
 * Painel de Gestão (Supervisão/Coordenação). O envio ao GBF-RH é o de sempre:
 * a fila de saída manda e a situação devolvida aparece aqui. O detalhe técnico
 * do envio fica em Configurações → Integrações → Envios ao RH (Admin).
 */
export default async function SolicitacoesRhPage({ searchParams }: { searchParams: { aba?: string; unit?: string; unidade?: string } }) {
  const user = (await getSessionUser())!;
  const [units, acesso, podeEditar] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    abasDoPerfil(user.role, 'RH_DEMANDS'),
    canEditModule(user.role, 'RH_DEMANDS'),
  ]);
  const ids = units.map((u) => u.id);
  const filtroUnidade = resolveUnitFilter(searchParams, ids, getSelectedUnitId(ids));
  const unitIds = filtroUnidade.all ? undefined : filtroUnidade.ids;

  const podeCriar = podeEditar && podeAba(acesso, 'nova') && podeEditarAba(acesso, 'nova') && units.length > 0;
  const abas: AbaDaTela[] = [
    ...(podeAba(acesso, 'minhas') ? ['minhas' as const] : []),
    ...(podeCriar ? ['nova' as const] : []),
    ...(podeAba(acesso, 'painel') ? ['painel' as const] : []),
  ];
  const pedida = searchParams.aba as AbaDaTela | undefined;
  const aba: AbaDaTela = pedida && abas.includes(pedida) ? pedida : abas[0] ?? 'minhas';

  const [linhas, collaborators] = await Promise.all([
    aba === 'nova' ? Promise.resolve([]) : listarDemandas(user, { unitIds }),
    aba === 'nova'
      ? prisma.collaborator.findMany({ where: { active: true, units: { some: { unit: { active: true, ...unitScopeWhere(user, 'id') } } } }, orderBy: { name: 'asc' }, select: { id: true, name: true, units: { select: { unitId: true } } } })
      : Promise.resolve([]),
  ]);
  const collaboratorsByUnit: Record<string, { id: string; name: string }[]> = {};
  for (const c of collaborators) for (const u of c.units) (collaboratorsByUnit[u.unitId] ??= []).push({ id: c.id, name: c.name });

  const hoje = hojeNaOperacao();
  return (
    <SolicitacoesRhClient
      aba={aba}
      abas={abas}
      linhas={linhas}
      limiteAtingido={linhas.length >= LIMITE_DA_LISTA}
      painel={aba === 'painel' ? montarPainel(linhas, new Date(), hoje) : null}
      hoje={hoje}
      podeCriar={podeCriar}
      units={units}
      unidadeInicial={filtroUnidade.all ? '' : filtroUnidade.ids[0] ?? ''}
      collaboratorsByUnit={collaboratorsByUnit}
      visaoRede={filtroUnidade.all && units.length > 1}
    />
  );
}
