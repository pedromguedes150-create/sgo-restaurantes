import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getSemanaDaRede } from '@/lib/manager-schedule-rede';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { DIA_ABREV, DIA_LONGO, ddmm, ddmmaaaa } from '@/lib/controle-gerentes';
import { SIGLA_DA_SITUACAO, lerSemana, semanaAnterior, semanaSeguinte } from '@/lib/manager-schedule-semana';
import type { SituacaoHoje } from '@/lib/manager-schedule-regras';
import { LargeTitle } from '@/components/layout/page-chrome';
import { PrintButton } from '@/components/ui/print-button';
import { AutoPrint } from '@/components/shared/auto-print';

export const dynamic = 'force-dynamic';

const wd = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

const COR: Record<SituacaoHoje, string> = {
  TRABALHA: 'text-ink-700',
  FOLGA: 'bg-warning-bg font-bold text-warning',
  FERIAS: 'bg-info-bg font-bold text-info',
  FORA_DO_PADRAO: 'text-ink-500',
  SEM_HORARIO: 'text-ink-500',
};

function Numero({ rotulo, valor, apoio, alerta, testId }: { rotulo: string; valor: number; apoio: string; alerta?: boolean; testId?: string }) {
  return (
    <div className="rounded-card border border-line p-3" data-testid={testId}>
      <p className="sgo-type-11 font-semibold uppercase text-ink-500">{rotulo}</p>
      <p className={`sgo-type-24 font-bold tabular-nums ${alerta ? 'text-danger' : 'text-ink-900'}`}>{valor}</p>
      <p className="text-xs text-ink-500">{apoio}</p>
    </div>
  );
}

/**
 * RELATÓRIO SEMANAL DE FOLGAS DOS GERENTES (v1.228.0) — PDF pela impressão.
 *
 * O documento que a diretoria manda toda segunda-feira: a semana de segunda a
 * domingo, com o resumo, o que pede atenção, a grade de cada unidade e a lista
 * das folgas. Mora sob "Hoje na rede" e abre para quem abre aquela tela; os
 * dados respeitam o escopo de unidade do usuário. Não grava nada.
 */
export default async function RelatorioSemanalPage({ searchParams }: { searchParams: { semana?: string; imprimir?: string } }) {
  const user = (await getSessionUser())!;
  const hoje = hojeNaOperacao();
  const segunda = lerSemana(searchParams.semana, hoje);
  const s = await getSemanaDaRede(user, segunda);
  const { resumo: r } = s;
  const base = '/modulos/escala-gerentes/hoje/semana';

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/modulos/escala-gerentes/hoje" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Hoje na rede</Link>
        <LargeTitle
          title="Relatório semanal de folgas"
          subtitle="De segunda a domingo: quem folga em cada dia, quem está de férias e onde falta gerente."
          actions={<PrintButton label="Salvar PDF" />}
        />
        <div className="sgo-filtros -mx-4 mt-3 flex flex-wrap items-center gap-2">
          <Link href={`${base}?semana=${semanaAnterior(segunda)}`} className="sgo-btn sgo-btn--sm" data-testid="semana-anterior"><ChevronLeft className="h-4 w-4" /> Semana anterior</Link>
          <span className="text-sm font-semibold text-ink-900">{ddmmaaaa(s.de)} a {ddmmaaaa(s.ate)}</span>
          <Link href={`${base}?semana=${semanaSeguinte(segunda)}`} className="sgo-btn sgo-btn--sm" data-testid="semana-seguinte">Próxima semana <ChevronRight className="h-4 w-4" /></Link>
          {segunda !== lerSemana(undefined, hoje) && <Link href={base} className="sgo-btn sgo-btn--sm">Semana atual</Link>}
        </div>
      </div>

      <div className="sgo-print mx-auto max-w-5xl space-y-6 bg-surface p-4 text-ink-900 print:p-0" data-testid="relatorio-semanal">
        {searchParams.imprimir === '1' && <AutoPrint />}

        <header className="border-b-4 border-brand pb-3">
          <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR · ESCALA DE GERENTES</p>
          <h1 className="text-2xl font-bold text-ink-900">Folgas dos gerentes — semana de {ddmmaaaa(s.de)} a {ddmmaaaa(s.ate)}</h1>
          <p className="text-sm text-ink-700">{r.unidades} unidade(s) · {r.gerentes} gerente(s) · emitido em {ddmmaaaa(hoje)} por {user.name}</p>
        </header>

        {/* ── Números da semana ── */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          <Numero rotulo="Com folga" valor={r.comFolga} apoio={`de ${r.gerentes} gerentes · ${r.diasDeFolga} dia(s)`} testId="num-com-folga" />
          <Numero rotulo="Sem folga lançada" valor={r.semFolga} apoio="nem folga nem férias na semana" alerta={r.semFolga > 0} testId="num-sem-folga" />
          <Numero rotulo="De férias" valor={r.emFerias} apoio="em algum dia da semana" />
          <Numero rotulo="Unidades descobertas" valor={r.unidadesComDiaDescoberto} apoio={`${r.diasDescobertos} dia(s) sem gerente`} alerta={r.unidadesComDiaDescoberto > 0} testId="num-descobertas" />
        </section>

        {/* ── Leitura ── */}
        <section data-testid="leitura-da-semana">
          <h2 className="sgo-type-17 mb-1 font-bold text-brand">Leitura da semana</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-900">
            {s.leituras.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </section>

        {/* ── Dia a dia ── */}
        <section className="break-inside-avoid">
          <h2 className="sgo-type-17 mb-2 font-bold text-brand">Gerentes fora, dia a dia</h2>
          <div className="grid grid-cols-7 gap-1" data-testid="dia-a-dia">
            {s.dias.map((iso, i) => (
              <div key={iso} className={`rounded-card border p-2 text-center ${s.descobertasPorDia[i] > 0 ? 'border-danger' : 'border-line'}`}>
                <p className="sgo-type-11 font-semibold uppercase text-ink-500">{DIA_ABREV[wd(iso)]}</p>
                <p className="text-xs tabular-nums text-ink-500">{ddmm(iso)}</p>
                <p className="sgo-type-24 font-bold tabular-nums text-ink-900">{s.foraPorDia[i]}</p>
                <p className={`text-[10px] ${s.descobertasPorDia[i] > 0 ? 'font-semibold text-danger' : 'text-ink-500'}`}>
                  {s.descobertasPorDia[i] > 0 ? `${s.descobertasPorDia[i]} unid. sem gerente` : 'todas cobertas'}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Atenção ── */}
        {(s.descobertos.length > 0 || s.semFolga.length > 0) && (
          <section className="break-inside-avoid" data-testid="pontos-de-atencao">
            <h2 className="sgo-type-17 mb-1 font-bold text-brand">Pontos de atenção</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-ink-900">Unidades com dia sem gerente</p>
                {s.descobertos.length === 0 ? <p className="text-sm text-ink-500">Nenhuma.</p> : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {s.descobertos.map((d) => (
                      <li key={d.unitName}><b>{d.unitName}</b> — {d.dias.map((iso) => `${DIA_ABREV[wd(iso)]} ${ddmm(iso)}`).join(', ')}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">Gerentes sem folga lançada na semana</p>
                {s.semFolga.length === 0 ? <p className="text-sm text-ink-500">Nenhum.</p> : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {s.semFolga.map((g) => <li key={g.name + g.unidades.join()}><b>{g.name}</b> <span className="text-ink-500">— {g.unidades.join(' / ')}</span></li>)}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Grade por unidade ── */}
        <section>
          <h2 className="sgo-type-17 mb-1 font-bold text-brand">Grade da semana por unidade</h2>
          <p className="mb-2 text-xs text-ink-500">T = na unidade · F = folga · FE = férias · – = fora do padrão semanal · ? = sem horário cadastrado</p>
          <table className="w-full border-collapse text-xs" data-testid="grade-da-semana">
            <thead>
              <tr className="border-b-2 border-brand">
                <th className="py-1 text-left font-semibold text-ink-700">Gerente</th>
                {s.dias.map((iso) => (
                  <th key={iso} className="w-12 py-1 text-center font-semibold text-ink-700">{DIA_ABREV[wd(iso)]}<span className="block font-normal tabular-nums text-ink-500">{ddmm(iso)}</span></th>
                ))}
                <th className="w-12 py-1 text-right font-semibold text-ink-700">Folgas</th>
              </tr>
            </thead>
            {s.unidades.map((u) => (
              <tbody key={u.unitId} className="break-inside-avoid" data-testid={`grade-${u.unitId}`}>
                <tr className="border-b border-line bg-sunken">
                  <td className="px-1 py-1 font-bold text-ink-900" colSpan={9}>
                    {u.unitName}
                    {u.diasSemGerente.length > 0 && <span className="ml-2 font-semibold text-danger">· {u.diasSemGerente.length} dia(s) sem gerente</span>}
                    {u.semHorario && <span className="ml-2 font-normal text-ink-500">· nenhum horário cadastrado</span>}
                  </td>
                </tr>
                {u.linhas.length === 0 ? (
                  <tr className="border-b border-line"><td className="px-1 py-1 text-ink-500" colSpan={9}>Nenhum gerente vinculado.</td></tr>
                ) : u.linhas.map((l) => (
                  <tr key={l.userId} className="border-b border-line">
                    <td className="px-1 py-1 text-ink-900">{l.name}{l.semFolga && <span className="ml-1 text-ink-500">(sem folga)</span>}</td>
                    {l.dias.map((sit, i) => (
                      <td key={i} className={`py-1 text-center ${COR[sit]} ${u.diasSemGerente.includes(s.dias[i]) ? 'border-x border-danger' : ''}`}>{SIGLA_DA_SITUACAO[sit]}</td>
                    ))}
                    <td className="py-1 text-right font-semibold tabular-nums">{l.folgas}{l.ferias > 0 ? ` + ${l.ferias} FE` : ''}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </section>

        {/* ── Lista das folgas ── */}
        <section className="break-before-page">
          <h2 className="sgo-type-17 mb-1 font-bold text-brand">Folgas e férias da semana — dia a dia</h2>
          {s.folgas.length === 0 ? <p className="text-sm text-ink-500">Nenhuma folga ou férias lançada nesta semana.</p> : (
            <table className="w-full border-collapse text-xs" data-testid="lista-de-folgas">
              <thead>
                <tr className="border-b-2 border-brand">
                  <th className="py-1 text-left font-semibold text-ink-700">Dia</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Unidade</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Gerente</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Tipo</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Lançado por</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {s.folgas.map((f, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="whitespace-nowrap py-1 tabular-nums">{DIA_LONGO[wd(f.iso)]}, {ddmm(f.iso)}</td>
                    <td className="py-1">{f.unitName}</td>
                    <td className="py-1 font-medium text-ink-900">{f.name}</td>
                    <td className="py-1">{f.kind === 'FERIAS' ? 'Férias' : 'Folga'}</td>
                    <td className="py-1">{f.lancadoPor ?? 'o próprio gerente'}</td>
                    <td className="py-1 text-ink-700">{f.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="pt-2 text-center text-[10px] text-ink-500">
          Gerado pelo SGO Beija Flor em {ddmmaaaa(hoje)} · folgas e férias lançadas na Escala de gerentes · gerente sem horário cadastrado não conta como cobertura
        </p>
      </div>
    </div>
  );
}
