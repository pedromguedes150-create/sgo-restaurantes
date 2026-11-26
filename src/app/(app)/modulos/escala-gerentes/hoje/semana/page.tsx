import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getSemanaDaRede } from '@/lib/manager-schedule-rede';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { ddmmaaaa } from '@/lib/controle-gerentes';
import { lerSemana, quadroExecutivo, semanaAnterior, semanaSeguinte } from '@/lib/manager-schedule-semana';
import { LargeTitle } from '@/components/layout/page-chrome';
import { PrintButton } from '@/components/ui/print-button';
import { AutoPrint } from '@/components/shared/auto-print';

export const dynamic = 'force-dynamic';

/** "COMERCIAL LINS & GUEDES LTDA (JARDIM TERESÓPOLIS)" → "Jardim Teresópolis": a diretoria lê o nome da loja. */
function nomeDaLoja(nome: string): string {
  const m = /\(([^)]+)\)\s*$/.exec(nome);
  if (!m) return nome;
  const miudas = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);
  return m[1].trim().toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && miudas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

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
  const s = await getSemanaDaRede(user, segunda, { semApoio: true });
  const quadro = quadroExecutivo(s);
  const { resumo: r } = s;
  const base = '/modulos/escala-gerentes/hoje/semana';

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/modulos/escala-gerentes/hoje" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Hoje na rede</Link>
        <LargeTitle
          title="Relatório semanal de folgas"
          subtitle="De segunda a domingo, loja por loja: quem folga, quem está de férias e onde falta gerente. Sem o Centro de Distribuição e a unidade Produtos."
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
          <p className="text-sm text-ink-700">Segunda a domingo · {r.unidades} loja(s) · {r.gerentes} gerente(s) · emitido em {ddmmaaaa(hoje)}</p>
        </header>

        {/* ── Números da semana ── */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          <Numero rotulo="Com folga" valor={r.comFolga} apoio={`de ${r.gerentes} gerentes · ${r.diasDeFolga} dia(s)`} testId="num-com-folga" />
          <Numero rotulo="Sem folga lançada" valor={r.semFolga} apoio="nem folga nem férias na semana" alerta={r.semFolga > 0} testId="num-sem-folga" />
          <Numero rotulo="De férias" valor={r.emFerias} apoio="em algum dia da semana" />
          <Numero rotulo="Lojas descobertas" valor={r.unidadesComDiaDescoberto} apoio={`${r.diasDescobertos} dia(s) sem gerente na semana`} alerta={r.unidadesComDiaDescoberto > 0} testId="num-descobertas" />
        </section>

        {/* ── Leitura ── */}
        <section data-testid="leitura-da-semana">
          <h2 className="sgo-type-17 mb-1 font-bold text-brand">Resumo</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-900">
            {s.leituras.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </section>

        {/* ── O quadro: uma linha por loja ── */}
        <section>
          <h2 className="sgo-type-17 mb-1 font-bold text-brand">Folgas da semana, loja por loja</h2>
          <table className="w-full border-collapse text-sm" data-testid="quadro-executivo">
            <thead>
              <tr className="border-b-2 border-brand">
                <th className="py-1 pr-2 text-left font-semibold text-ink-700">Loja</th>
                <th className="py-1 pr-2 text-left font-semibold text-ink-700">Folga na semana</th>
                <th className="py-1 pr-2 text-left font-semibold text-ink-700">Férias</th>
                <th className="py-1 pr-2 text-left font-semibold text-ink-700">Sem folga lançada</th>
                <th className="py-1 text-left font-semibold text-ink-700">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {quadro.map((u) => (
                <tr key={u.unitId} className="break-inside-avoid border-b border-line align-top" data-testid={`loja-${u.unitId}`}>
                  <td className="py-2 pr-2">
                    <b className="text-ink-900">{nomeDaLoja(u.unitName)}</b>
                    <span className="block text-xs text-ink-500">{u.gerentes} gerente(s)</span>
                  </td>
                  <td className="py-2 pr-2">
                    {u.folgas.length === 0 ? <span className="text-ink-500">—</span> : u.folgas.map((f) => (
                      <span key={f.name} className="block"><b className="font-semibold text-ink-900">{f.name}</b> <span className="text-ink-700">· {f.quando}</span></span>
                    ))}
                  </td>
                  <td className="py-2 pr-2">
                    {u.ferias.length === 0 ? <span className="text-ink-500">—</span> : u.ferias.map((f) => (
                      <span key={f.name} className="block"><b className="font-semibold text-ink-900">{f.name}</b> <span className="text-ink-700">· {f.quando}</span></span>
                    ))}
                  </td>
                  <td className={`py-2 pr-2 ${u.semFolga.length > 0 ? 'text-danger' : 'text-ink-500'}`}>{u.semFolga.length > 0 ? u.semFolga.join(', ') : '—'}</td>
                  <td className={`py-2 font-semibold ${u.semGerente ? 'text-danger' : 'text-success'}`}>
                    {u.gerentes === 0 ? <span className="font-normal text-ink-500">sem gerente cadastrado</span> : u.semGerente ? `Sem gerente: ${u.semGerente}` : 'Coberta a semana toda'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="pt-2 text-center text-[10px] text-ink-500">
          Gerado pelo SGO Beija Flor em {ddmmaaaa(hoje)} · semana de segunda a domingo · só as lojas (sem Centro de Distribuição e Produtos) · gerente sem horário cadastrado não conta como cobertura
        </p>
      </div>
    </div>
  );
}
