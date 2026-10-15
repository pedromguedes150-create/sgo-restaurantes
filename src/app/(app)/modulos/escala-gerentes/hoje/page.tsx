import Link from 'next/link';
import { ArrowLeft, Building2, CalendarClock, Palmtree, Sun, UserRoundX, Users } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getHojeNaRede } from '@/lib/manager-schedule-rede';
import { abasDaEscalaDeGerentes } from '@/lib/manager-schedule-abas';
import { SITUACAO_ROTULO, type SituacaoHoje } from '@/lib/manager-schedule-regras';
import { DIA_LONGO, ddmmaaaa } from '@/lib/controle-gerentes';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { EmptyState } from '@/components/ui/ds/empty-state';

export const dynamic = 'force-dynamic';

const fmt = (iso: string) => iso.split('-').reverse().join('/');
const diaDaSemana = (iso: string) => DIA_LONGO[new Date(`${iso}T00:00:00Z`).getUTCDay()];

const TONE: Record<SituacaoHoje, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  TRABALHA: 'success',
  FOLGA: 'warning',
  FERIAS: 'info',
  FORA_DO_PADRAO: 'neutral',
  SEM_HORARIO: 'danger',
};

/**
 * HOJE NA REDE (v1.170.0) — Admin/CEO e Coordenação.
 *
 * A pergunta da diretoria às 8h: "quem está de folga ou férias HOJE, e alguma
 * unidade ficou sem gerente?". Unidade com problema sobe para o topo. Tudo é
 * leitura dos mesmos lançamentos da Escala de gerentes, no escopo do usuário.
 */
export default async function HojeNaRedePage() {
  const user = (await getSessionUser())!;
  const [dados, tabs] = await Promise.all([getHojeNaRede(user), abasDaEscalaDeGerentes(user, 'hoje')]);
  const { resumo, unidades, proximos } = dados;
  const foraHoje = unidades.flatMap((u) => u.linhas.filter((l) => l.situacao === 'FOLGA' || l.situacao === 'FERIAS').map((l) => ({ ...l, unitName: u.unitName })));

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden">
        <ArrowLeft className="h-4 w-4" /> Pessoas
      </Link>
      <LargeTitle
        title="Gerentes hoje na rede"
        subtitle={`${diaDaSemana(dados.hoje)}, ${ddmmaaaa(dados.hoje)} — quem está de folga ou férias, quem cobre e onde não há ninguém.`}
        tabs={tabs.length > 1 ? tabs : undefined}
      />

      <SgoKpis>
        <SgoKpi label="Gerentes na rede" value={String(resumo.gerentes)} meta={`${resumo.trabalhando} na unidade hoje`} icon={Users} tone="blue" />
        <SgoKpi label="De folga hoje" value={String(resumo.deFolga)} meta="lançadas na Escala de gerentes" icon={Sun} tone="amber" testId="kpi-folga" />
        <SgoKpi label="De férias hoje" value={String(resumo.deFerias)} meta="período em curso" icon={Palmtree} tone="blue" testId="kpi-ferias" />
        <SgoKpi
          label="Unidades sem gerente" value={String(resumo.unidadesSemGerente)}
          meta={resumo.unidadesSemGerente > 0 ? 'nenhum gerente com horário trabalha hoje' : 'todas cobertas'}
          metaTone={resumo.unidadesSemGerente > 0 ? 'warn' : undefined}
          valueColor={resumo.unidadesSemGerente > 0 ? 'var(--sgo-bad)' : undefined}
          icon={Building2} tone={resumo.unidadesSemGerente > 0 ? 'red' : 'green'} testId="kpi-sem-gerente"
        />
        <SgoKpi label="Voltam amanhã" value={String(resumo.voltamAmanha)} meta={`em ${fmt(dados.amanha)}`} icon={CalendarClock} tone="green" />
      </SgoKpis>

      {/* ── Quem está fora hoje ── */}
      <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="fora-hoje">
        <p className="sgo-panel__title px-3 pt-3">Fora hoje — {foraHoje.length} gerente(s)</p>
        {foraHoje.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-ink-500">Nenhum gerente de folga ou férias hoje.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Unidade</th>
                  <th className="text-left">Gerente</th>
                  <th className="text-left">Situação</th>
                  <th className="text-left">Período</th>
                  <th className="text-left">Lançado por</th>
                  <th className="text-left">Retorno</th>
                </tr>
              </thead>
              <tbody>
                {foraHoje.map((l) => (
                  <tr key={`${l.unitName}-${l.userId}`}>
                    <td className="whitespace-nowrap font-medium text-ink-900">{l.unitName}</td>
                    <td className="whitespace-nowrap">{l.name}</td>
                    <td><StatusBadge tone={TONE[l.situacao]} dot>{SITUACAO_ROTULO[l.situacao]}</StatusBadge></td>
                    <td className="whitespace-nowrap tabular-nums">
                      {l.startDate && l.endDate ? (l.startDate === l.endDate ? fmt(l.startDate) : `${fmt(l.startDate)} a ${fmt(l.endDate)}`) : '—'}
                      {l.note ? <span className="block text-xs text-ink-500">{l.note}</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-ink-700">{l.lancadoPor ?? 'o próprio gerente'}</td>
                    <td className="whitespace-nowrap">{l.voltaAmanha ? <StatusBadge tone="success">amanhã</StatusBadge> : l.endDate ? fmt(l.endDate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Cobertura por unidade ── */}
      <section className="space-y-2">
        <p className="text-sm font-semibold text-ink-900">Cobertura por unidade</p>
        {unidades.length === 0 ? (
          <EmptyState icon={Building2} title="Nenhuma unidade no seu escopo" description="Vincule-se a uma unidade para ver a cobertura." />
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {unidades.map((u) => (
              <div
                key={u.unitId}
                data-testid={`unidade-${u.unitId}`}
                className={`rounded-lg border p-3 ${u.semGerente ? 'border-danger/50 bg-danger/10' : 'bg-surface'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/modulos/escala-gerentes?unit=${u.unitId}`} className="text-sm font-semibold text-ink-900 hover:text-brand">{u.unitName}</Link>
                  {u.semGerente ? (
                    <StatusBadge tone="danger" dot>Sem gerente hoje</StatusBadge>
                  ) : u.linhas.length === 0 ? (
                    <StatusBadge tone="neutral">Sem gerente cadastrado</StatusBadge>
                  ) : u.semHorario ? (
                    <StatusBadge tone="neutral">Sem horário cadastrado</StatusBadge>
                  ) : (
                    <StatusBadge tone="success" dot>Coberta</StatusBadge>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {u.cobertura.length > 0 ? <>Na unidade: <b className="text-ink-900">{u.cobertura.join(', ')}</b></> : u.linhas.length === 0 ? 'Nenhum gerente vinculado.' : 'Ninguém com horário trabalha hoje.'}
                </p>
                <ul className="mt-2 space-y-1">
                  {u.linhas.map((l) => (
                    <li key={l.userId} className="flex items-center justify-between gap-2 text-xs">
                      <span className={l.situacao === 'TRABALHA' ? 'text-ink-900' : 'text-ink-700'}>{l.name}</span>
                      <StatusBadge tone={TONE[l.situacao]} dot>{SITUACAO_ROTULO[l.situacao]}</StatusBadge>
                    </li>
                  ))}
                  {u.linhas.length === 0 && <li className="flex items-center gap-1 text-xs text-ink-500"><UserRoundX className="h-3.5 w-3.5" /> sem gerente cadastrado</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Próximos 7 dias ── */}
      <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="proximos">
        <p className="sgo-panel__title px-3 pt-3">Próximos 7 dias — ausências já lançadas</p>
        {proximos.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-ink-500">Nenhuma folga ou férias lançada para os próximos 7 dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead>
                <tr><th className="text-left">Dia</th><th className="text-left">Unidade</th><th className="text-left">Gerente</th><th className="text-left">Tipo</th></tr>
              </thead>
              <tbody>
                {proximos.map((p, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap tabular-nums">{fmt(p.iso)} <span className="text-xs text-ink-500">{diaDaSemana(p.iso).slice(0, 3)}</span></td>
                    <td className="whitespace-nowrap">{p.unitName}</td>
                    <td className="whitespace-nowrap">{p.name}</td>
                    <td><StatusBadge tone={p.kind === 'FERIAS' ? 'info' : 'warning'} dot>{p.kind === 'FERIAS' ? 'Férias' : 'Folga'}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-ink-500">
        &ldquo;Na unidade&rdquo; = gerente com horário cadastrado para hoje e sem folga/férias. Quem não tem horário não conta como cobertura.
        Os lançamentos são os da Escala de gerentes; esta tela não grava nada.
      </p>
    </div>
  );
}
