import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { isFullAccess, permissoesEfetivasDoRequest } from '@/lib/permissions';
import { listarCargos } from '@/lib/curriculos/cargos';
import { cargosEncaminhados, indicadoresDosCurriculos, listarCurriculos, PODE_ENCAMINHAR, rhConectado } from '@/lib/curriculos/curriculos';
import { faixaValida } from '@/lib/curriculos/regras';
import { CurriculosClient } from '@/components/curriculos/curriculos-client';

export const dynamic = 'force-dynamic';

/**
 * CENTRAL DE CURRÍCULOS (v1.212.0) — o gerente encaminha candidatos ao RH e
 * acompanha. Obedece o seletor de unidade do cabeçalho; o recorte de verdade é
 * o do servidor (`unitScopeWhere`), a URL só estreita.
 */
export default async function CurriculosPage({ searchParams }: { searchParams: { faixa?: string; q?: string; cargo?: string; abrir?: string; unit?: string; unidade?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const ids = units.map((u) => u.id);
  const filtroUnidade = resolveUnitFilter(searchParams, ids, getSelectedUnitId(ids));
  const unitIds = filtroUnidade.all ? undefined : filtroUnidade.ids;

  const faixa = faixaValida(searchParams.faixa);
  const q = (searchParams.q ?? '').slice(0, 80);
  const cargo = (searchParams.cargo ?? '').slice(0, 60);
  const filtro = { unitIds, faixa, q, cargo };

  const [{ linhas, total }, indicadores, cargos, cargosDaLista, conectado, perms] = await Promise.all([
    listarCurriculos(user, filtro),
    indicadoresDosCurriculos(user, filtro),
    listarCargos(true),
    cargosEncaminhados(user, unitIds),
    rhConectado(),
    permissoesEfetivasDoRequest(user.role),
  ]);

  const acessoTotal = isFullAccess(user.role);

  return (
    <CurriculosClient
      linhas={linhas.map((l) => ({
        id: l.id, unidade: l.unit.name, candidateName: l.candidateName, phone: l.phone, jobTitleName: l.jobTitleName, attachmentMime: l.attachmentMime,
        note: l.note, status: l.status, statusNote: l.statusNote, statusAt: l.statusAt.toISOString(), interviewAt: l.interviewAt?.toISOString() ?? null,
        rhReadAt: l.rhReadAt?.toISOString() ?? null, createdByName: l.createdByName, createdAt: l.createdAt.toISOString(),
      }))}
      total={total}
      indicadores={indicadores}
      units={units}
      unidadeInicial={filtroUnidade.all ? '' : filtroUnidade.ids[0] ?? ''}
      cargos={cargos.map((c) => ({ id: c.id, name: c.name }))}
      cargosDaLista={cargosDaLista}
      filtros={{ faixa, q, cargo }}
      podeEncaminhar={PODE_ENCAMINHAR.has(user.role) && (acessoTotal || Boolean(perms.RESUMES?.canEdit))}
      podeConfigurar={acessoTotal}
      visaoRede={units.length > 1}
      rhConectado={conectado}
      abrirId={searchParams.abrir ?? null}
    />
  );
}
