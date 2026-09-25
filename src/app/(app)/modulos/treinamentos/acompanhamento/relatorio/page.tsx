import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getPainelTreinamentos, filtrosDaUrl, urlDosFiltros } from '@/lib/treinamentos/painel';
import { emData, emPercentual, statusEfetivo, type StatusTreino } from '@/lib/treinamentos/agregacao';
import { ORIGEM_LABEL } from '@/lib/treinamentos/aplicabilidade';
import { PrintButton } from '@/components/ui/print-button';
import { AutoPrint } from '@/components/shared/auto-print';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<StatusTreino, string> = { DONE: 'Concluído', PENDING: 'Pendente', MISSED: 'Atrasado' };
const STATUS_CLASSE: Record<StatusTreino, string> = { DONE: 'text-success', PENDING: 'text-warning', MISSED: 'text-danger' };

function hojeBr(): string { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }

/**
 * RELATÓRIO DE TREINAMENTOS DA REDE — PDF pela impressão.
 *
 * Respeita os filtros da tela (vêm na URL): sem filtro é o consolidado da
 * rede; com filtro, só o recorte. A primeira página é o RESUMO EXECUTIVO
 * (rede, unidades, treinamentos com mais pendência); as pendências e o
 * detalhamento por colaborador vêm depois. Identidade vinho/bordô do SGO.
 */
export default async function RelatorioTreinamentosPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const filtros = filtrosDaUrl(searchParams);
  const { painel, opcoes, hoje, mesAtual } = await getPainelTreinamentos(user, filtros);
  const { resumo } = painel;

  const periodo = filtros.de || filtros.ate
    ? `${filtros.de ? emData(filtros.de) : 'início'} a ${filtros.ate ? emData(filtros.ate) : 'hoje'} (pelo prazo)`
    : `Ciclo vigente — ${mesAtual.slice(5)}/${mesAtual.slice(0, 4)}`;

  const recorte: string[] = [];
  if (filtros.unitId) recorte.push(`Unidade: ${opcoes.unidades.find((u) => u.id === filtros.unitId)?.name ?? filtros.unitId}`);
  if (filtros.jobTitle) recorte.push(`Função: ${filtros.jobTitle}`);
  if (filtros.popId) recorte.push(`Treinamento: ${opcoes.treinamentos.find((t) => t.id === filtros.popId)?.title ?? filtros.popId}`);
  if (filtros.collaboratorId) recorte.push(`Colaborador: ${opcoes.colaboradores.find((c) => c.id === filtros.collaboratorId)?.name ?? filtros.collaboratorId}`);
  if (filtros.status && filtros.status !== 'todos') recorte.push(`Status: ${{ concluido: 'Concluído', pendente: 'Pendente', atrasado: 'Atrasado' }[filtros.status]}`);

  const th = 'py-1 pr-2 text-left font-semibold';
  const thN = 'py-1 pl-2 text-right font-semibold';
  const td = 'py-1 pr-2 align-top';
  const tdN = 'py-1 pl-2 text-right tabular-nums align-top';

  return (
    <div className="sgo-print mx-auto max-w-4xl space-y-5 bg-surface p-4 text-ink-900 print:p-0">
      {searchParams.imprimir === '1' && <AutoPrint />}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/treinamentos/acompanhamento${urlDosFiltros(filtros)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Voltar ao acompanhamento</Link>
        <PrintButton label="Salvar PDF" />
      </div>

      {/* Cabeçalho */}
      <header className="border-b-4 border-brand pb-3">
        <p className="sgo-type-11 font-semibold tracking-wide text-brand">GRUPO BEIJA-FLOR</p>
        <h1 className="text-2xl font-bold text-ink-900">Relatório de Treinamentos</h1>
        <div className="mt-1 grid gap-x-6 text-sm text-ink-700 sm:grid-cols-2">
          <p><span className="text-ink-500">Período:</span> {periodo}</p>
          <p><span className="text-ink-500">Data de emissão:</span> {hojeBr()}</p>
          <p className="sm:col-span-2"><span className="text-ink-500">Abrangência:</span> {recorte.length ? recorte.join(' · ') : 'Toda a rede (sem filtros)'}</p>
        </div>
      </header>

      {/* 1. Resumo geral */}
      <section>
        <h2 className="sgo-type-13 mb-2 font-bold text-brand">1. Resumo geral {recorte.length ? 'do recorte' : 'da rede'}</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Kpi label="Colaboradores" valor={resumo.colaboradores} />
          <Kpi label="Previstos" valor={resumo.previstos} />
          <Kpi label="Concluídos" valor={resumo.concluidos} classe="text-success" />
          <Kpi label="Pendentes" valor={resumo.pendentes} classe={resumo.pendentes ? 'text-warning' : ''} />
          <Kpi label="Atrasados" valor={resumo.atrasados} classe={resumo.atrasados ? 'text-danger' : ''} />
          <Kpi label="Conclusão" valor={emPercentual(resumo.taxa)} classe="text-brand" />
        </div>
        <p className="mt-1 text-xs text-ink-500">Previstos = concluídos + pendentes + atrasados. Cada colaborador conta só os treinamentos aplicáveis a ele (gerais da unidade, da sua função e vínculos individuais).</p>
      </section>

      {/* 2. Por unidade */}
      <section>
        <h2 className="sgo-type-13 mb-2 font-bold text-brand">2. Resultado por unidade</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b-2 border-brand text-ink-700"><th className={th}>Unidade</th><th className={thN}>Previstos</th><th className={thN}>Concluídos</th><th className={thN}>Pendentes</th><th className={thN}>Atrasados</th><th className={thN}>Conclusão</th></tr></thead>
          <tbody>
            {painel.porUnidade.length === 0 && <tr><td colSpan={6} className="py-2 text-ink-500">Sem atribuições.</td></tr>}
            {painel.porUnidade.map((u) => (
              <tr key={u.unitId} className="border-b border-line">
                <td className={td}>{u.unitName}</td><td className={tdN}>{u.previstos}</td><td className={tdN}>{u.concluidos}</td>
                <td className={`${tdN} ${u.pendentes ? 'text-warning' : ''}`}>{u.pendentes}</td><td className={`${tdN} ${u.atrasados ? 'text-danger' : ''}`}>{u.atrasados}</td>
                <td className={`${tdN} font-semibold`}>{emPercentual(u.taxa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 3. Por treinamento */}
      <section>
        <h2 className="sgo-type-13 mb-2 font-bold text-brand">3. Resultado por treinamento</h2>
        <p className="mb-1 text-xs text-ink-500">Menor conclusão primeiro — os que mais precisam de atenção.</p>
        <table className="w-full text-sm">
          <thead><tr className="border-b-2 border-brand text-ink-700"><th className={th}>Treinamento</th><th className={thN}>Aplicáveis</th><th className={thN}>Concluídos</th><th className={thN}>Pendentes</th><th className={thN}>Atrasados</th><th className={thN}>Conclusão</th></tr></thead>
          <tbody>
            {painel.porTreinamento.length === 0 && <tr><td colSpan={6} className="py-2 text-ink-500">Sem treinamentos.</td></tr>}
            {painel.porTreinamento.map((t) => (
              <tr key={t.popId} className="border-b border-line">
                <td className={td}>{t.popTitle}</td><td className={tdN}>{t.previstos}</td><td className={tdN}>{t.concluidos}</td>
                <td className={`${tdN} ${t.pendentes ? 'text-warning' : ''}`}>{t.pendentes}</td><td className={`${tdN} ${t.atrasados ? 'text-danger' : ''}`}>{t.atrasados}</td>
                <td className={`${tdN} font-semibold`}>{emPercentual(t.taxa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 4. Pendências */}
      <section className="break-before-page">
        <h2 className="sgo-type-13 mb-2 font-bold text-brand">4. Pendências — quem ainda precisa treinar</h2>
        <p className="mb-1 text-xs text-ink-500">{painel.pendencias.length} pendência(s), por unidade e colaborador.</p>
        <table className="w-full text-xs">
          <thead><tr className="border-b-2 border-brand text-ink-700"><th className={th}>Unidade</th><th className={th}>Colaborador</th><th className={th}>Função</th><th className={th}>Treinamento</th><th className={th}>Origem</th><th className={th}>Prazo</th><th className={th}>Status</th></tr></thead>
          <tbody>
            {painel.pendencias.length === 0 && <tr><td colSpan={7} className="py-2 text-ink-500">Nenhuma pendência no recorte.</td></tr>}
            {painel.pendencias.map((l) => {
              const s = statusEfetivo(l, hoje);
              return (
                <tr key={l.recordId} className="border-b border-line">
                  <td className={td}>{l.unitName}</td><td className={td}>{l.collaboratorName}</td><td className={td}>{l.jobTitle ?? '—'}</td>
                  <td className={td}>{l.popTitle}</td><td className={td}>{ORIGEM_LABEL[l.origin]}</td><td className={td}>{emData(l.dueDate)}</td>
                  <td className={`${td} font-semibold ${STATUS_CLASSE[s]}`}>{STATUS_LABEL[s]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 5. Detalhamento por colaborador */}
      <section className="break-before-page">
        <h2 className="sgo-type-13 mb-2 font-bold text-brand">5. Detalhamento dos colaboradores</h2>
        <table className="w-full text-xs">
          <thead><tr className="border-b-2 border-brand text-ink-700"><th className={th}>Colaborador</th><th className={th}>Unidade</th><th className={th}>Função</th><th className={thN}>Aplicáveis</th><th className={thN}>Concluídos</th><th className={thN}>Pendentes</th><th className={thN}>Atrasados</th><th className={thN}>Conclusão</th></tr></thead>
          <tbody>
            {painel.porColaborador.length === 0 && <tr><td colSpan={8} className="py-2 text-ink-500">Sem colaboradores.</td></tr>}
            {painel.porColaborador.map((c) => (
              <tr key={`${c.collaboratorId}|${c.unitId}`} className="border-b border-line">
                <td className={td}>{c.name}</td><td className={td}>{c.unitName}</td><td className={td}>{c.jobTitle ?? '—'}</td>
                <td className={tdN}>{c.previstos}</td><td className={tdN}>{c.concluidos}</td>
                <td className={`${tdN} ${c.pendentes ? 'text-warning' : ''}`}>{c.pendentes}</td><td className={`${tdN} ${c.atrasados ? 'text-danger' : ''}`}>{c.atrasados}</td>
                <td className={`${tdN} font-semibold`}>{emPercentual(c.taxa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="pt-2 text-center text-[10px] text-ink-500">Gerado pelo SGO Beija Flor em {hojeBr()} · {resumo.previstos} atribuição(ões) · {painel.detalhado.length ? '' : 'sem dados no recorte'}</p>
    </div>
  );
}

function Kpi({ label, valor, classe = '' }: { label: string; valor: number | string; classe?: string }) {
  return (
    <div className="rounded-card border border-line p-2">
      <p className="sgo-type-11 text-ink-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${classe || 'text-ink-900'}`}>{valor}</p>
    </div>
  );
}
