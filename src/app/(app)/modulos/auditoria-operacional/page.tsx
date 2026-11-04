import Link from 'next/link';
import { Droplets, FileText, Flame, Settings2, Wallet } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { canEditModule } from '@/lib/permissions';
import { permissaoDeRota } from '@/lib/permissions/links';
import { getAuditoriaOperacional } from '@/lib/auditoria-operacional/auditoria';
import { diaEmBrasilia, moduloAuditado, MODULOS_AUDITADOS, podeAuditar, podeJustificar } from '@/lib/auditoria-operacional/regras';
import { getAuditoriaDeAtestados } from '@/lib/certificates/auditoria';
import { LargeTitle } from '@/components/layout/page-chrome';
import { AuditoriaOperacionalClient, type ResumoDeAtestados } from '@/components/auditoria-operacional/auditoria-operacional-client';

export const dynamic = 'force-dynamic';

const ICONE = { NOTES: FileText, GAS: Flame, OIL: Droplets, PAYMENTS: Wallet } as const;

/**
 * AUDITORIA OPERACIONAL (v1.184.0): Notas · Gás · Óleo · Pagamentos — o que
 * deveria ter sido lançado × o que foi lançado, com a régua dos atestados.
 * Escopo por unidade no servidor; o filtro de unidade da URL entra em AND.
 */
export default async function AuditoriaOperacionalPage({ searchParams }: { searchParams: { modulo?: string; mes?: string; unit?: string } }) {
  const user = (await getSessionUser())!;
  const cat = moduloAuditado(searchParams.modulo) ?? MODULOS_AUDITADOS[0];
  const ym = /^\d{4}-\d{2}$/.test(searchParams.mes ?? '') ? searchParams.mes! : diaEmBrasilia(new Date()).slice(0, 7);
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const unitFiltro = searchParams.unit && units.some((u) => u.id === searchParams.unit) ? searchParams.unit : '';
  const [auditoria, podeEditar, permite] = await Promise.all([
    getAuditoriaOperacional(user, ym, { unitId: unitFiltro || undefined, modulo: cat.key }),
    canEditModule(user.role, 'OPERATIONAL_AUDIT'),
    permissaoDeRota(user.role),
  ]);
  /* Os atestados ficam na Central própria (ajuste 2 do Pedro): aqui só o resumo do mês, com o link. */
  let atestados: ResumoDeAtestados | null = null;
  try {
    const r = (await getAuditoriaDeAtestados(user, ym, unitFiltro || undefined)).rede;
    atestados = { esperados: r.esperados, conformes: r.conformes, justificados: r.justificados, falhas: r.falhas, emConferencia: r.emConferencia, pct: r.pct, pontos: r.pontos };
  } catch { atestados = null; }
  const linkAtestados = permite('/modulos/atestados') ? `/modulos/atestados?aba=auditoria&mes=${ym}${unitFiltro ? `&unit=${unitFiltro}` : ''}` : null;
  const linkModulo = (m: string) => `/modulos/auditoria-operacional?modulo=${m.toLowerCase()}&mes=${ym}${unitFiltro ? `&unit=${unitFiltro}` : ''}`;

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Auditoria operacional"
        subtitle="O que deveria ter sido lançado × o que foi lançado, por ocorrência. A supervisão informa, o gerente justifica, a supervisão decide; só a falha confirmada pesa."
        tabs={MODULOS_AUDITADOS.map((m) => { const Icone = ICONE[m.key]; return { label: m.rotulo, icon: <Icone className="h-3.5 w-3.5" />, href: linkModulo(m.key), active: m.key === cat.key, testId: `aba-${m.key.toLowerCase()}` }; })}
        actions={['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role) ? <Link href="/modulos/metas/config" className="sgo-btn"><Settings2 className="h-3.5 w-3.5" /> Pesos e parâmetros</Link> : undefined}
      />
      <AuditoriaOperacionalClient
        auditoria={auditoria}
        ym={ym}
        unitFiltro={unitFiltro}
        units={units}
        podeInformar={podeAuditar(user.role) && podeEditar}
        podeJustificar={podeJustificar(user.role)}
        atestados={atestados}
        linkAtestados={linkAtestados}
      />
    </div>
  );
}
