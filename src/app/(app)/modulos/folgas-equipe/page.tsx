import { FileText } from 'lucide-react';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { getSessionUser } from '@/lib/auth/session';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { ControleGerentesClient } from '@/components/people/controle-gerentes-client';
import { gerentesPorUnidade, hojeNaOperacao, unidadesDoControle } from '@/lib/controle-gerentes-dados';
import {
  MESES, PERIODOS, ROTULO, ausenciasNoPeriodo, diasDoMes, ehPeriodo, intervaloDoPeriodo, semanaDe, somarDias, textoDoIntervalo, ddmm,
  type Periodo,
} from '@/lib/controle-gerentes';

export const dynamic = 'force-dynamic';

/**
 * CONTROLE DE GERENTES.
 *
 * A UNIDADE controla, a REDE só consolida. "Por unidade" mostra os gerentes
 * daquela unidade — resumo, quem folga hoje/esta semana/próxima, a grade do mês
 * e o calendário. "Visão da rede" empilha as unidades, cada uma no seu bloco:
 * não é uma escala única, e nenhum gerente aparece fora da unidade dele.
 *
 * Só leitura: o lançamento de folga, férias e horário segue na Escala de
 * gerentes. Os registros são os mesmos (`ManagerLeave`, `ManagerWorkSchedule`).
 */
export default async function ControleDeGerentesPage({
  searchParams,
}: {
  searchParams: { visao?: string; unit?: string; ano?: string; mes?: string; periodo?: string };
}) {
  const user = (await getSessionUser())!;
  const perms = await permissoesEfetivasDoRequest(user.role);
  if (!perms.LEAVES_TEAM?.canView) {
    return <p className="text-sm text-ink-500">Acesso restrito. O Controle de gerentes é liberado pela Supervisão/Administração (Configurações → Perfis de acesso).</p>;
  }

  const units = await unidadesDoControle(user);
  const hoje = hojeNaOperacao();
  const year = Number(searchParams.ano) || Number(hoje.slice(0, 4));
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || Number(hoje.slice(5, 7))));
  const rede = searchParams.visao === 'rede';
  const base = `ano=${year}&mes=${month}`;

  const header = (
    <div className="space-y-3">
      <LargeTitle title="Controle de gerentes" subtitle="Folgas e férias de gerência — cada unidade com a sua escala." />
      <FamilyTabs active="/modulos/folgas-equipe" />
      <SegmentedNav
        aria-label="Visão"
        value={rede ? 'rede' : 'unidade'}
        options={[
          { value: 'unidade', label: 'Por unidade', href: `/modulos/folgas-equipe?${base}${searchParams.unit ? `&unit=${searchParams.unit}` : ''}` },
          { value: 'rede', label: 'Visão da rede', href: `/modulos/folgas-equipe?visao=rede&${base}` },
        ]}
      />
    </div>
  );

  if (units.length === 0) {
    return <div className="space-y-4">{header}<p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p></div>;
  }

  /* ─────────────────── Visão da rede: consolidada, NUNCA misturada ─────────────────── */
  if (rede) {
    const periodo: Periodo = ehPeriodo(searchParams.periodo) ? searchParams.periodo : 'semana';
    const { de, ate } = intervaloDoPeriodo(periodo, hoje, year, month);
    const porUnidade = await gerentesPorUnidade(units.map((u) => u.id), de, ate);
    const titulo = periodo === 'hoje' ? `Folgas de hoje (${ddmm(hoje)})`
      : periodo === 'mes' ? `Folgas de ${MESES[month - 1]}/${year}`
      : `Folgas ${periodo === 'semana' ? 'desta semana' : 'da próxima semana'} (${ddmm(de)} a ${ddmm(ate)})`;

    return (
      <div className="space-y-4">
        {header}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedNav
            aria-label="Período"
            value={periodo}
            options={PERIODOS.map((p) => ({ value: p.value, label: p.label, href: `/modulos/folgas-equipe?visao=rede&${base}&periodo=${p.value}` }))}
          />
          <a
            href={`/modulos/folgas-equipe/relatorio?${base}&unit=todas&imprimir=1`} target="_blank" rel="noreferrer"
            className="sgo-control inline-flex h-9 items-center gap-1 rounded-control bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover"
          >
            <FileText className="h-4 w-4" /> Escala mensal PDF — todas as unidades
          </a>
        </div>
        <p className="sgo-type-13 font-semibold text-ink-900">{titulo} — rede</p>
        <p className="text-xs text-ink-500">Consolidado: cada unidade continua com a sua escala. Clique na unidade para abrir a grade e o calendário dela.</p>

        <div className="grid gap-3 md:grid-cols-2">
          {units.map((u) => {
            const gerentes = porUnidade.get(u.id) ?? [];
            const itens = ausenciasNoPeriodo(gerentes, de, ate);
            return (
              <section key={u.id} className="rounded-card border border-line bg-surface p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <a href={`/modulos/folgas-equipe?${base}&unit=${u.id}`} className="sgo-type-13 font-semibold text-brand hover:underline">{u.name}</a>
                  <span className="text-xs text-ink-500">{gerentes.length} gerente(s)</span>
                </div>
                {itens.length === 0 ? (
                  <p className="text-sm text-ink-500">Nenhuma folga ou férias no período.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {itens.map((it, i) => (
                      <li key={`${it.userId}-${i}`} className="flex items-center justify-between gap-2 py-1 text-sm">
                        <span className="min-w-0 truncate"><b className="text-ink-900">{it.name}</b> — {textoDoIntervalo(it.de, it.ate)}</span>
                        <span className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-semibold ${it.kind === 'FERIAS' ? 'bg-info/15 text-info' : 'bg-brand/15 text-brand'}`}>{ROTULO[it.kind]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  /* ─────────────────── Por unidade: a unidade controla ─────────────────── */
  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const mes = diasDoMes(year, month);
  const proxima = semanaDe(somarDias(semanaDe(hoje).ate, 1));
  /* Uma consulta cobre tudo que a tela mostra: o mês escolhido, os últimos 7
     dias (alerta de folga) e esta semana + a próxima, que contam a partir de hoje. */
  const de = [mes[0].iso, somarDias(hoje, -7)].sort()[0];
  const ate = [mes[mes.length - 1].iso, proxima.ate].sort()[1];
  const gerentes = (await gerentesPorUnidade([selected.id], de, ate)).get(selected.id) ?? [];

  return (
    <div className="space-y-4">
      {header}
      <ControleGerentesClient
        units={units}
        unitId={selected.id}
        unitName={selected.name}
        year={year}
        month={month}
        hoje={hoje}
        gerentes={gerentes}
      />
    </div>
  );
}
