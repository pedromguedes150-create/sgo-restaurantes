import Link from 'next/link';
import { ClipboardCheck, ClipboardList, History, Settings2 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { permissaoDeRota } from '@/lib/permissions/links';
import { emAbertoDaUnidade, indicadoresDeAuditoria, listarInventarios } from '@/lib/utensilios/inventario';
import { PODE_AUDITAR, PODE_CONTAR, ROTULO_STATUS, TOM_STATUS, type StatusInventario } from '@/lib/utensilios/regras';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { AbrirContagem } from '@/components/utensilios/abrir-contagem';
import { FiltrosHistorico } from '@/components/utensilios/filtros-historico';

export const dynamic = 'force-dynamic';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_VALIDOS = new Set<string>(['RASCUNHO', 'PENDENTE', 'EM_CORRECAO', 'APROVADO']);

/**
 * INVENTÁRIO DE UTENSÍLIOS (v1.177.0) — três abas: CONTAGEM (o gerente abre ou
 * retoma a contagem da unidade), AUDITORIA (pendentes primeiro, para a
 * Supervisão/Coordenação) e HISTÓRICO (tudo, com filtros e PDF por inventário).
 * A unidade vem do seletor do cabeçalho; o escopo de verdade é o do servidor.
 */
export default async function InventarioUtensiliosPage({ searchParams }: {
  searchParams: { aba?: string; unit?: string; unidade?: string; de?: string; ate?: string; status?: string; gerente?: string };
}) {
  const user = (await getSessionUser())!;
  const audita = PODE_AUDITAR.has(user.role);
  const conta = PODE_CONTAR.has(user.role);
  const abaPedida = searchParams.aba;
  const aba = abaPedida === 'auditoria' && audita ? 'auditoria' : abaPedida === 'historico' ? 'historico' : abaPedida === 'contagem' || !audita ? 'contagem' : 'auditoria';

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const ids = units.map((u) => u.id);
  const filtroUnidade = resolveUnitFilter(searchParams, ids, getSelectedUnitId(ids));
  const unitIds = filtroUnidade.all ? undefined : filtroUnidade.ids;
  const podeConfigurar = (await permissaoDeRota(user.role))('/configuracoes/utensilios');

  const hoje = hojeNaOperacao();
  const de = DIA.test(searchParams.de ?? '') ? searchParams.de! : `${hoje.slice(0, 4)}-01-01`;
  const ate = DIA.test(searchParams.ate ?? '') ? searchParams.ate! : hoje;
  const status = STATUS_VALIDOS.has(searchParams.status ?? '') ? (searchParams.status as StatusInventario) : null;

  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ aba: extra.aba, unit: searchParams.unit, unidade: searchParams.unidade, de: extra.de, ate: extra.ate, status: extra.status, gerente: extra.gerente })) if (v) p.set(k, v);
    const s = p.toString();
    return `/modulos/inventario-utensilios${s ? `?${s}` : ''}`;
  };

  const tabs = [
    ...(conta ? [{ label: 'Contagem', icon: <ClipboardList className="h-3.5 w-3.5" />, href: q({ aba: 'contagem' }), active: aba === 'contagem', testId: 'aba-contagem' }] : []),
    ...(audita ? [{ label: 'Auditoria', icon: <ClipboardCheck className="h-3.5 w-3.5" />, href: q({ aba: 'auditoria' }), active: aba === 'auditoria', testId: 'aba-auditoria' }] : []),
    { label: 'Histórico', icon: <History className="h-3.5 w-3.5" />, href: q({ aba: 'historico' }), active: aba === 'historico', testId: 'aba-historico' },
  ];

  const cabecalho = (
    <LargeTitle
      title="Inventário de Utensílios"
      subtitle="Contagem periódica de pratos, copos, talheres e afins por unidade: o gerente conta e envia, a Supervisão confere, aprova ou devolve para correção."
      tabs={tabs}
      actions={podeConfigurar ? <Link href="/configuracoes/utensilios" className="sgo-btn sgo-btn--sm"><Settings2 className="h-4 w-4" /> Lista padrão</Link> : undefined}
    />
  );

  if (aba === 'contagem') {
    const alvo = filtroUnidade.all ? units : units.filter((u) => filtroUnidade.ids.includes(u.id));
    const abertos = await Promise.all(alvo.map(async (u) => ({ unidade: u, aberto: await emAbertoDaUnidade(u.id) })));
    const recentes = await listarInventarios(user, { unitIds }, 10);
    return (
      <div className="space-y-4">
        {cabecalho}
        <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="contagem-unidades">
          <p className="sgo-panel__title px-3 pt-3 sm:px-4">{alvo.length === 1 ? 'Sua contagem' : 'Contagem por unidade'}</p>
          <ul className="divide-y divide-line">
            {abertos.map(({ unidade, aberto }) => (
              <li key={unidade.id} className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{unidade.name}</p>
                  <p className="text-xs text-ink-500">
                    {aberto ? <>Em andamento: <StatusBadge tone={TOM_STATUS[aberto.status as StatusInventario]} dot>{ROTULO_STATUS[aberto.status as StatusInventario]}</StatusBadge></> : 'Nenhuma contagem em aberto.'}
                  </p>
                </div>
                {aberto && aberto.status === 'PENDENTE'
                  ? <Link href={`/modulos/inventario-utensilios/${aberto.id}`} className="sgo-btn sgo-btn--sm">Ver enviado</Link>
                  : <AbrirContagem unitId={unidade.id} rotulo={aberto ? (aberto.status === 'EM_CORRECAO' ? 'Corrigir' : 'Continuar') : 'Iniciar contagem'} />}
              </li>
            ))}
            {abertos.length === 0 && <li className="px-3 py-3 text-sm text-ink-500">Nenhuma unidade no seu alcance.</li>}
          </ul>
        </section>
        <Lista titulo="Últimos inventários" linhas={recentes} mostrarUnidade={units.length > 1} vazio="Nenhum inventário ainda." />
      </div>
    );
  }

  if (aba === 'auditoria') {
    const [ind, pendentes, emCorrecao] = await Promise.all([
      indicadoresDeAuditoria(user, de, ate, unitIds),
      listarInventarios(user, { unitIds, status: 'PENDENTE' }),
      listarInventarios(user, { unitIds, status: 'EM_CORRECAO' }),
    ]);
    return (
      <div className="space-y-4">
        {cabecalho}
        <SgoKpis>
          <SgoKpi label="Pendentes de auditoria" value={ind.pendentes} valueColor={ind.pendentes > 0 ? 'var(--sgo-warn)' : undefined} testId="kpi-pendentes" />
          <SgoKpi label="Em correção" value={ind.emCorrecao} valueColor={ind.emCorrecao > 0 ? 'var(--sgo-bad)' : undefined} testId="kpi-correcao" />
          <SgoKpi label="Aprovados no período" value={ind.aprovados} meta={`${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`} testId="kpi-aprovados" />
        </SgoKpis>
        <Lista titulo="Aguardando sua auditoria" linhas={pendentes.sort((a, b) => (a.enviadoEm?.getTime() ?? 0) - (b.enviadoEm?.getTime() ?? 0))} mostrarUnidade={units.length > 1} vazio="Nada pendente de auditoria." acao="Auditar" />
        <Lista titulo="Devolvidos — aguardando o gerente corrigir" linhas={emCorrecao} mostrarUnidade={units.length > 1} vazio="Nenhum em correção." />
      </div>
    );
  }

  const gerentes = await prisma.user.findMany({ where: { active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId: { in: ids } } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const gerente = gerentes.some((g) => g.id === searchParams.gerente) ? searchParams.gerente : undefined;
  const linhas = await listarInventarios(user, { unitIds, de, ate, status, managerId: gerente });
  return (
    <div className="space-y-4">
      {cabecalho}
      <FiltrosHistorico de={de} ate={ate} status={status ?? ''} gerente={gerente ?? ''} gerentes={gerentes} base={q({ aba: 'historico' })} />
      <Lista titulo={`Histórico · ${linhas.length} inventário(s)`} linhas={linhas} mostrarUnidade={units.length > 1} vazio="Nenhum inventário no período." />
    </div>
  );
}

function Lista({ titulo, linhas, mostrarUnidade, vazio, acao }: { titulo: string; linhas: Awaited<ReturnType<typeof listarInventarios>>; mostrarUnidade: boolean; vazio: string; acao?: string }) {
  const fmt = (d: Date | null) => d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="lista-inventarios">
      <p className="sgo-panel__title px-3 pt-3 sm:px-4">{titulo}</p>
      {linhas.length === 0 ? <p className="px-3 pb-3 text-sm text-ink-500 sm:px-4">{vazio}</p> : (
        <div className="overflow-x-auto">
          <table className="sgo-tbl w-full text-sm">
            <thead><tr>
              {mostrarUnidade && <th className="text-left">Unidade</th>}
              <th className="text-left">Gerente</th><th className="text-left">Criado</th><th className="text-left">Enviado</th><th className="text-right">Total</th><th className="text-left">Situação</th><th className="text-left">Auditor</th><th />
            </tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} data-testid="linha-inventario">
                  {mostrarUnidade && <td className="font-medium text-ink-900">{l.unidade}</td>}
                  <td>{l.managerName}</td>
                  <td className="text-xs text-ink-500">{fmt(l.criadoEm)}</td>
                  <td className="text-xs text-ink-500">{fmt(l.enviadoEm)}</td>
                  <td className="text-right tabular-nums font-semibold">{l.total.toLocaleString('pt-BR')}</td>
                  <td><StatusBadge tone={TOM_STATUS[l.status]} dot>{ROTULO_STATUS[l.status]}</StatusBadge>{l.divergentes > 0 && <span className="ml-2 text-xs text-danger">{l.divergentes} divergência(s)</span>}</td>
                  <td className="text-xs text-ink-500">{l.auditorName ?? '—'}</td>
                  <td className="text-right"><Link href={`/modulos/inventario-utensilios/${l.id}`} className="sgo-btn sgo-btn--sm">{acao ?? 'Abrir'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
