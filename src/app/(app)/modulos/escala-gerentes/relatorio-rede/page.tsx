import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getRelatorioDaRede } from '@/lib/manager-schedule-rede';
import { abasDaEscalaDeGerentes } from '@/lib/manager-schedule-abas';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { MESES, ddmmaaaa } from '@/lib/controle-gerentes';
import { LargeTitle } from '@/components/layout/page-chrome';
import { PrintButton } from '@/components/ui/print-button';
import { AutoPrint } from '@/components/shared/auto-print';
import { RelatorioRedeFiltro } from '@/components/people/relatorio-rede-filtro';

export const dynamic = 'force-dynamic';

const fmt = (iso: string) => iso.split('-').reverse().join('/');
const quando = (iso: string) => (iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—');

/**
 * FOLGAS E FÉRIAS DOS GERENTES DA REDE — PDF pela impressão (v1.170.0).
 *
 * Só Administrador/CEO: é a rede inteira, gerente a gerente, com quem lançou,
 * quem está SEM folga cadastrada (o que a meta desconta) e as exclusões do mês
 * com o motivo. A conferência da lib (`getRelatorioDaRede`) vale mesmo que a
 * matriz libere a tela para outro perfil.
 */
export default async function RelatorioRedePage({ searchParams }: { searchParams: { ano?: string; mes?: string; imprimir?: string } }) {
  const user = (await getSessionUser())!;
  const hoje = hojeNaOperacao();
  const year = Number(searchParams.ano) || Number(hoje.slice(0, 4));
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || Number(hoje.slice(5, 7))));
  const [rel, tabs] = await Promise.all([getRelatorioDaRede(user, year, month), abasDaEscalaDeGerentes(user, 'relatorio')]);
  if (!rel) return <p className="text-sm text-ink-500">Relatório restrito ao Administrador.</p>;

  const titulo = `${MESES[month - 1].toUpperCase()}/${year}`;
  const { resumo } = rel;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
        <LargeTitle
          title="Folgas e férias dos gerentes da rede"
          subtitle="Toda a rede, gerente a gerente — quem lançou, quem está sem folga cadastrada e as exclusões com motivo."
          tabs={tabs.length > 1 ? tabs : undefined}
          actions={<PrintButton label="Salvar PDF" />}
        />
        <div className="sgo-filtros -mx-4 mt-3">
          <RelatorioRedeFiltro year={year} month={month} />
        </div>
      </div>

      <div className="sgo-print mx-auto max-w-5xl space-y-6 bg-surface p-4 text-ink-900 print:p-0" data-testid="relatorio-rede">
        {searchParams.imprimir === '1' && <AutoPrint />}
        <header className="border-b-4 border-brand pb-3">
          <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR</p>
          <h1 className="text-2xl font-bold text-ink-900">FOLGAS E FÉRIAS DOS GERENTES — REDE — {titulo}</h1>
          <p className="text-sm text-ink-700">{resumo.unidades} unidade(s) · {resumo.gerentes} gerente(s) · emitido em {ddmmaaaa(rel.hoje)} por {user.name}</p>
        </header>

        {/* ── Resumo executivo ── */}
        <section>
          <h2 className="sgo-type-17 mb-2 font-bold text-brand">Resumo executivo</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-line"><td className="py-1 text-ink-700">Gerentes com folga ou férias cadastrada no mês</td><td className="py-1 text-right font-semibold tabular-nums">{resumo.comFolga}</td></tr>
              <tr className="border-b border-line"><td className="py-1 text-ink-700">Gerentes SEM folga cadastrada (desconto na meta da unidade)</td><td className={`py-1 text-right font-semibold tabular-nums ${resumo.semFolga > 0 ? 'text-danger' : ''}`} data-testid="resumo-sem-folga">{resumo.semFolga}</td></tr>
              <tr className="border-b border-line"><td className="py-1 text-ink-700">Dias de folga no mês (soma)</td><td className="py-1 text-right font-semibold tabular-nums">{resumo.diasDeFolga}</td></tr>
              <tr className="border-b border-line"><td className="py-1 text-ink-700">Dias de férias no mês (soma)</td><td className="py-1 text-right font-semibold tabular-nums">{resumo.diasDeFerias}</td></tr>
              <tr className="border-b border-line"><td className="py-1 text-ink-700">Lançamentos feitos pelo próprio gerente / pela Supervisão</td><td className="py-1 text-right font-semibold tabular-nums">{resumo.lancadosPeloGerente} / {resumo.lancadosPelaSupervisao}</td></tr>
              <tr><td className="py-1 text-ink-700">Exclusões no mês (com motivo)</td><td className="py-1 text-right font-semibold tabular-nums">{resumo.exclusoes}</td></tr>
            </tbody>
          </table>
        </section>

        {/* ── Por unidade ── */}
        {rel.unidades.map((u, idx) => (
          <section key={u.unitId} className={idx > 0 ? 'break-before-page' : ''}>
            <h2 className="sgo-type-17 mb-1 font-bold text-brand">{idx + 1}. {u.unitName}</h2>
            {u.gerentes.length === 0 ? (
              <p className="text-sm text-ink-500">Nenhum gerente vinculado a esta unidade.</p>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-brand">
                    <th className="py-1 text-left font-semibold text-ink-700">Gerente</th>
                    <th className="py-1 text-left font-semibold text-ink-700">Tipo</th>
                    <th className="py-1 text-left font-semibold text-ink-700">Período</th>
                    <th className="py-1 text-right font-semibold text-ink-700">Dias no mês</th>
                    <th className="py-1 text-left font-semibold text-ink-700">Lançado por</th>
                    <th className="py-1 text-left font-semibold text-ink-700">Em</th>
                    <th className="py-1 text-left font-semibold text-ink-700">Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {u.gerentes.map((g) => g.semFolga ? (
                    <tr key={g.userId} className="border-b border-line bg-danger/10" data-testid={`sem-folga-${g.userId}`}>
                      <td className="py-1 font-medium text-ink-900">{g.name}{!g.temHorario && <span className="block font-normal text-ink-500">sem horário cadastrado</span>}</td>
                      <td className="py-1 font-semibold text-danger" colSpan={6}>SEM FOLGA NEM FÉRIAS CADASTRADA NO MÊS</td>
                    </tr>
                  ) : g.lancamentos.map((l, i) => (
                    <tr key={`${g.userId}-${i}`} className="border-b border-line">
                      <td className="py-1 font-medium text-ink-900">{i === 0 ? g.name : ''}{i === 0 && !g.temHorario && <span className="block font-normal text-ink-500">sem horário cadastrado</span>}</td>
                      <td className="py-1">{l.kind === 'FERIAS' ? 'Férias' : 'Folga'}</td>
                      <td className="py-1 whitespace-nowrap tabular-nums">{l.startDate === l.endDate ? fmt(l.startDate) : `${fmt(l.startDate)} a ${fmt(l.endDate)}`}</td>
                      <td className="py-1 text-right tabular-nums">{l.diasNoMes}</td>
                      <td className="py-1">{l.lancadoPor}</td>
                      <td className="py-1 whitespace-nowrap tabular-nums">{quando(l.lancadoEm)}</td>
                      <td className="py-1 text-ink-700">{l.note ?? ''}</td>
                    </tr>
                  )))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand">
                    <td className="py-1 font-semibold" colSpan={3}>Total da unidade</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {u.gerentes.reduce((s, g) => s + g.diasDeFolga, 0)} folga · {u.gerentes.reduce((s, g) => s + g.diasDeFerias, 0)} férias
                    </td>
                    <td colSpan={3} className="py-1 text-ink-700">{u.gerentes.filter((g) => g.semFolga).length} gerente(s) sem folga cadastrada</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        ))}

        {/* ── Exclusões ── */}
        <section className="break-before-page">
          <h2 className="sgo-type-17 mb-1 font-bold text-brand">Exclusões no mês — com motivo</h2>
          {rel.exclusoes.length === 0 ? (
            <p className="text-sm text-ink-500">Nenhum lançamento apagado neste mês.</p>
          ) : (
            <table className="w-full border-collapse text-xs" data-testid="exclusoes">
              <thead>
                <tr className="border-b-2 border-brand">
                  <th className="py-1 text-left font-semibold text-ink-700">Unidade</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Gerente</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Tipo</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Período</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Motivo</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Apagado por</th>
                  <th className="py-1 text-left font-semibold text-ink-700">Em</th>
                </tr>
              </thead>
              <tbody>
                {rel.exclusoes.map((e, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-1">{e.unitName}</td>
                    <td className="py-1 font-medium text-ink-900">{e.managerName}</td>
                    <td className="py-1">{e.kind === 'FERIAS' ? 'Férias' : 'Folga'}</td>
                    <td className="py-1 whitespace-nowrap tabular-nums">{e.startDate === e.endDate ? fmt(e.startDate) : `${fmt(e.startDate)} a ${fmt(e.endDate)}`}</td>
                    <td className="py-1 text-ink-700">{e.motivo}</td>
                    <td className="py-1">{e.apagadoPor}</td>
                    <td className="py-1 whitespace-nowrap tabular-nums">{quando(e.apagadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="pt-2 text-center text-[10px] text-ink-500">Gerado pelo SGO Beija Flor em {ddmmaaaa(rel.hoje)} · documento restrito à Administração</p>
      </div>
    </div>
  );
}
