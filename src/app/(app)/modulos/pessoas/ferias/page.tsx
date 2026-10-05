import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertOctagon, AlertTriangle, ArrowLeft, CalendarCheck, CalendarClock, Clock, HandCoins, Palmtree, PencilLine, UserX, Users } from 'lucide-react';
import { listarAbonos, podeExcluirAbono } from '@/lib/people/abono';
import { MAX_DIAS_ABONO } from '@/lib/people/periodo-aquisitivo';
import { AbonoFerias } from '@/components/people/abono-ferias';
import { AjustesFerias } from '@/components/people/ajustes-ferias';
import { colaboradoresParaAjuste, getFeriasDoColaborador, podeCorrigirAdmissao } from '@/lib/people/ferias-manual';
import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { getControleDeFerias, type LinhaDoControle } from '@/lib/people/perfil-360';
import type { FaixaDeFerias } from '@/lib/people/periodo-aquisitivo';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const br = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');
const TODAS = 'todas';
type Filtro = FaixaDeFerias | 'GOZO' | 'PROGRAMADAS' | 'TODOS';

const ROTULO: Record<Filtro, string> = {
  VENCIDA: 'Vencidas', ATE_30: 'A vencer em até 30 dias', ATE_60: 'A vencer em 31 a 60 dias', ATE_90: 'A vencer em 61 a 90 dias',
  EM_DIA: 'Em dia', EM_AQUISICAO: 'Em aquisição (1º ano)', SEM_ADMISSAO: 'Sem admissão no RH', GOZO: 'Em gozo agora', PROGRAMADAS: 'Com férias programadas', TODOS: 'Todos os ativos',
};

/**
 * CONTROLE DE FÉRIAS (v1.153.0) — o período aquisitivo de cada colaborador
 * ativo, calculado pela admissão do RH (ver `periodo-aquisitivo.ts`). Só
 * leitura: o lançamento de férias segue em Pessoas → Férias.
 */
export default async function ControleDeFeriasPage({ searchParams }: { searchParams: { unidade?: string; ver?: string; aba?: string; colaborador?: string } }) {
  const user = (await getSessionUser())!;
  const abas = await abasDoPerfil(user.role, 'PEOPLE');
  if (abas.fer?.canView === false) notFound();
  const unidade = searchParams.unidade && searchParams.unidade !== TODAS ? searchParams.unidade : null;
  const ver: Filtro = (Object.keys(ROTULO) as Filtro[]).includes(searchParams.ver as Filtro) ? (searchParams.ver as Filtro) : 'VENCIDA';
  const aba = searchParams.aba === 'abono' || searchParams.aba === 'ajustes' ? searchParams.aba : 'situacao';
  const d = await getControleDeFerias(user, unidade);
  const r = d.resumo;
  const linkAba = (a: 'situacao' | 'abono' | 'ajustes') => `/modulos/pessoas/ferias?aba=${a}${unidade ? `&unidade=${unidade}` : ''}`;
  const cabecalho = (
    <>
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <LargeTitle
        title="Controle de Férias"
        subtitle="Período aquisitivo de cada colaborador ativo, pela admissão do RH: o que venceu, o que vence logo, quem está em gozo e quem vendeu dias."
        tabs={[
          { label: 'Situação', icon: <Palmtree className="h-3.5 w-3.5" />, href: linkAba('situacao'), active: aba === 'situacao', testId: 'aba-situacao' },
          { label: 'Abono (venda de dias)', icon: <HandCoins className="h-3.5 w-3.5" />, href: linkAba('abono'), active: aba === 'abono', testId: 'aba-abono' },
          { label: 'Ajustes manuais', icon: <PencilLine className="h-3.5 w-3.5" />, href: linkAba('ajustes'), active: aba === 'ajustes', testId: 'aba-ajustes' },
        ]}
      />
      {d.unidades.length > 1 && (
        <div className="sgo-filtros -mx-4 print:hidden">
          <span className="sgo-label">Unidade</span>
          <UnitSelectNav paramName="unidade" units={[{ id: TODAS, name: 'Todas as unidades' }, ...d.unidades.map((u) => ({ id: u.id, name: shortUnitName(u.name) }))]} selected={unidade ?? TODAS} />
        </div>
      )}
    </>
  );

  if (aba === 'ajustes') {
    const [lista, ficha] = await Promise.all([
      colaboradoresParaAjuste(user, unidade),
      searchParams.colaborador ? getFeriasDoColaborador(user, searchParams.colaborador) : Promise.resolve(null),
    ]);
    return (
      <div className="space-y-4" data-testid="controle-ferias">
        {cabecalho}
        <AjustesFerias
          colaboradores={lista.map((c) => ({ id: c.id, nome: c.name, hint: [c.jobTitle, c.hireDateManual ? `adm. ${br(c.hireDateManual)} (corrigida)` : c.hireDate ? `adm. ${br(c.hireDate)}` : 'sem admissão'].filter(Boolean).join(' · ') }))}
          ficha={ficha}
          podeEditar={abas.fer?.canEdit !== false}
          podeAdmissao={abas.fer?.canEdit !== false && podeCorrigirAdmissao(user)}
        />
      </div>
    );
  }

  if (aba === 'abono') {
    const abonos = await listarAbonos(user, unidade);
    const nomeUnidade = new Map(d.unidades.map((u) => [u.id, u.name]));
    return (
      <div className="space-y-4" data-testid="controle-ferias">
        {cabecalho}
        <AbonoFerias
          maxDias={MAX_DIAS_ABONO}
          podeRegistrar={abas.fer?.canEdit !== false}
          colaboradores={d.linhas.map((l) => ({ id: l.id, nome: l.nome, funcao: l.funcao, unidade: shortUnitName(l.unidade), vendaveis: l.vendaveis }))}
          abonos={abonos.map((a) => ({ id: a.id, colaborador: a.collaboratorName, collaboratorId: a.collaboratorId, unidade: shortUnitName(nomeUnidade.get(a.unitId) ?? ''), periodoInicio: a.periodoInicio, dias: a.dias, observacao: a.observacao, por: a.createdByName, em: a.createdAt.toISOString().slice(0, 10), podeExcluir: abas.fer?.canEdit !== false && podeExcluirAbono(user, a) }))}
        />
      </div>
    );
  }

  const link = (v: Filtro) => {
    const q = new URLSearchParams({ aba: 'situacao', ver: v });
    if (unidade) q.set('unidade', unidade);
    return `/modulos/pessoas/ferias?${q.toString()}`;
  };
  const lista = d.linhas
    .filter((l) => (ver === 'TODOS' ? true : ver === 'GOZO' ? l.emGozo : ver === 'PROGRAMADAS' ? Boolean(l.programada) : l.faixa === ver))
    .sort((a, b) => (a.foco?.diasParaVencer ?? 9999) - (b.foco?.diasParaVencer ?? 9999) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const situacao = (l: LinhaDoControle) => {
    if (l.faixa === 'SEM_ADMISSAO') return <span className="sgo-tag sgo-tag--gray">Sem admissão</span>;
    if (!l.foco) return <span className="sgo-tag sgo-tag--green">Em dia</span>;
    if (l.foco.situacao === 'VENCIDO') return <span className="sgo-tag sgo-tag--red">Vencida há {Math.abs(l.foco.diasParaVencer)}d</span>;
    if (l.foco.situacao === 'EM_AQUISICAO') return <span className="sgo-tag sgo-tag--blue">Em aquisição</span>;
    return <span className={`sgo-tag ${l.foco.diasParaVencer <= 30 ? 'sgo-tag--amber' : 'sgo-tag--gray'}`}>Faltam {l.foco.diasParaVencer}d</span>;
  };

  return (
    <div className="space-y-4" data-testid="controle-ferias">
      {cabecalho}

      <SgoKpis>
        <SgoKpi label="Vencidas" value={String(r.vencidas)} icon={AlertOctagon} tone="red" meta="prazo de concessão expirado" href={link('VENCIDA')} testId="kpi-vencidas" />
        <SgoKpi label="Vencem em 30 dias" value={String(r.ate30)} icon={AlertTriangle} tone="amber" meta="atenção imediata" href={link('ATE_30')} />
        <SgoKpi label="Vencem em 60 dias" value={String(r.ate60)} icon={Clock} tone="amber" meta="planejar em breve" href={link('ATE_60')} />
        <SgoKpi label="Vencem em 90 dias" value={String(r.ate90)} icon={Clock} tone="gray" meta="monitorar" href={link('ATE_90')} />
        <SgoKpi label="Em gozo agora" value={String(r.emGozo)} icon={Palmtree} tone="green" href={link('GOZO')} />
        <SgoKpi label="Programadas" value={String(r.programadas)} icon={CalendarClock} tone="blue" meta="férias futuras lançadas" href={link('PROGRAMADAS')} />
        <SgoKpi label="Em dia / em aquisição" value={`${r.emDia + r.emAquisicao}`} icon={CalendarCheck} tone="green" meta={`${r.emAquisicao} no 1º ano`} href={link('EM_DIA')} />
        <SgoKpi label="Sem admissão no RH" value={String(r.semAdmissao)} icon={UserX} tone="gray" meta="não dá para calcular" href={link('SEM_ADMISSAO')} />
      </SgoKpis>

      <div className="sgo-panel overflow-hidden">
        <PanelHeader title={ROTULO[ver]} count={lista.length} countTone={ver === 'VENCIDA' && lista.length ? 'red' : undefined} icon={<span className="sgo-panel__ic sgo-panel__ic--green" aria-hidden><Palmtree className="h-4 w-4" /></span>}
          action={<Link href={link('TODOS')} className="sgo-btn sgo-btn--sm">Ver todos ({r.ativos})</Link>} />
        <div className="overflow-x-auto">
          {lista.length === 0 ? <p className="p-4 text-sm text-ink-500">Ninguém nesta situação.</p> : (
            <table className="sgo-tbl w-full text-sm" data-testid="tabela-ferias">
              <thead>
                <tr>
                  <th className="text-left">Colaborador</th>
                  <th className="text-left">Unidade</th>
                  <th className="text-left">Admissão</th>
                  <th className="text-left">Período aquisitivo</th>
                  <th className="text-left">Conceder até</th>
                  <th className="text-right">Saldo</th>
                  <th className="text-right">Vendidos</th>
                  <th className="text-left">Situação</th>
                  <th className="text-left">Programada</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, 300).map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/modulos/pessoas/colaborador/${l.id}`} className="font-semibold text-ink-900 hover:text-brand hover:underline">{l.nome}</Link>
                      <span className="block text-xs text-ink-500">{l.funcao ?? '—'}</span>
                    </td>
                    <td className="text-ink-700">{shortUnitName(l.unidade)}</td>
                    <td className="tabular-nums">{br(l.admissao)}{l.admissaoCorrigida && <span className="block text-xs text-ink-500">corrigida à mão</span>}</td>
                    <td className="tabular-nums">{l.foco ? `${br(l.foco.inicio)} a ${br(l.foco.fim)}` : '—'}</td>
                    <td className="tabular-nums">{l.foco ? br(l.foco.limite) : '—'}</td>
                    <td className="text-right font-semibold tabular-nums">{l.foco ? `${l.foco.saldo}d` : '—'}{l.vencidos > 1 && <span className="block text-xs text-danger">{l.vencidos} vencidos</span>}</td>
                    <td className="text-right tabular-nums text-ink-700">{l.foco?.diasVendidos ? `${l.foco.diasVendidos}d` : '—'}</td>
                    <td>{situacao(l)}{l.foco?.parcial && <Link href={`/modulos/pessoas/ferias?aba=ajustes&colaborador=${l.id}`} className="block text-xs text-brand underline">pode haver gozo antes do SGO — informar</Link>}</td>
                    <td className="tabular-nums text-ink-700">{l.emGozo ? <span className="sgo-tag sgo-tag--green">Em gozo</span> : l.programada ? `${br(l.programada.inicio)} a ${br(l.programada.fim)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {d.porUnidade.length > 1 && (
        <Card>
          <PanelHeader title="Por unidade" icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><Users className="h-4 w-4" /></span>} />
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="sgo-tbl w-full text-sm">
                <thead><tr><th className="text-left">Unidade</th><th className="text-right">Ativos</th><th className="text-right">Vencidas</th><th className="text-right">Até 30d</th><th className="text-right">31–90d</th><th className="text-right">Em gozo</th><th className="text-right">Sem admissão</th></tr></thead>
                <tbody>
                  {d.porUnidade.map((u) => (
                    <tr key={u.unitId}>
                      <td><Link className="font-medium text-ink-900 hover:text-brand hover:underline" href={`/modulos/pessoas/ferias?unidade=${u.unitId}&ver=VENCIDA`}>{shortUnitName(u.nome)}</Link></td>
                      <td className="text-right tabular-nums">{u.ativos}</td>
                      <td className={`text-right font-semibold tabular-nums ${u.vencidas ? 'text-danger' : ''}`}>{u.vencidas}</td>
                      <td className="text-right tabular-nums">{u.ate30}</td>
                      <td className="text-right tabular-nums">{u.ate90}</td>
                      <td className="text-right tabular-nums">{u.emGozo}</td>
                      <td className="text-right tabular-nums text-ink-500">{u.semAdmissao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-ink-500">
        Como é calculado: a cada 12 meses desde a <b>admissão informada pelo RH</b> o colaborador adquire 30 dias, que precisam ser concedidos nos 12 meses seguintes.
        O gozo vem das férias registradas no SGO (Pessoas → Férias e o status “Férias” do RH). Períodos que venceram antes de o SGO começar a registrar férias (12/06/2026) não são julgados.
        Admissão errada ou férias de antes do SGO: corrija na aba “Ajustes manuais”. Dias vendidos (abono, até 10 por período) abatem o saldo — registre na aba “Abono (venda de dias)”. Para lançar ou pedir férias, use Pessoas → Férias.
      </p>
    </div>
  );
}
