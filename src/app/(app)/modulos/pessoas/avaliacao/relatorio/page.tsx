import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';
import { PrintButton } from '@/components/ui/print-button';
import { AutoPrint } from '@/components/shared/auto-print';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { getPainelAvaliacao } from '@/lib/people/avaliacao-painel';
import { fmtMes, lerFiltroPainel, pct, queryDoFiltroPainel, ROTULO_PLANO } from '@/lib/people/avaliacao-painel-calculo';
import { fmtNota, ROTULO_CLASSIFICACAO } from '@/lib/people/avaliacao-calculo';

export const dynamic = 'force-dynamic';

const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Painel de avaliação em PDF pela impressão (v1.162.0) — mesmo filtro e mesma conta da tela. */
export default async function AvaliacaoRelatorioPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const perms = await permissoesEfetivasDoRequest(user.role);
  if (!perms.PEOPLE_EVALUATION?.canView) return <p className="text-sm text-ink-500">Acesso restrito.</p>;
  const hoje = hojeNaOperacao();
  const filtro = lerFiltroPainel(searchParams, hoje.slice(0, 7));
  const { painel: p, unidades } = await getPainelAvaliacao(user, filtro, hoje);
  const unidade = filtro.unitId ? unidades.find((u) => u.id === filtro.unitId)?.name : null;

  return (
    <div className="sgo-print mx-auto max-w-5xl space-y-6 bg-surface p-4 text-ink-900 print:p-0">
      {searchParams.imprimir === '1' && <AutoPrint />}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/pessoas/avaliacao?aba=painel&${queryDoFiltroPainel(filtro)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Painel de avaliação</Link>
        <PrintButton label="Salvar PDF" />
      </div>

      <header className="border-b-4 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR</p>
        <h1 className="text-2xl font-bold text-ink-900">AVALIAÇÃO DO COLABORADOR — {fmtMes(filtro.de)} a {fmtMes(filtro.ate)}</h1>
        <p className="text-sm text-ink-700">
          {unidade ?? `${unidades.length} unidade(s)`}{filtro.funcao ? ` · função ${filtro.funcao}` : ''}{filtro.colaborador ? ` · colaborador: ${filtro.colaborador}` : ''} · emitido em {br(hoje)}
        </p>
      </header>

      <section>
        <h2 className="sgo-type-17 mb-2 font-bold text-brand">Resumo</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-line"><td className="py-1">Avaliações no período</td><td className="py-1 text-right tabular-nums">{p.resumo.avaliacoes}</td><td className="py-1 pl-6">Colaboradores avaliados</td><td className="py-1 text-right tabular-nums">{p.resumo.colaboradores}</td></tr>
            <tr className="border-b border-line"><td className="py-1">Média geral</td><td className="py-1 text-right tabular-nums">{fmtNota(p.resumo.media)}</td><td className="py-1 pl-6">Cobertura</td><td className="py-1 text-right tabular-nums">{pct(p.resumo.cobertura)}</td></tr>
            <tr className="border-b border-line"><td className="py-1">Abaixo do esperado</td><td className="py-1 text-right tabular-nums">{p.resumo.abaixo}</td><td className="py-1 pl-6">Revisões abertas</td><td className="py-1 text-right tabular-nums">{p.resumo.revisoesAbertas}</td></tr>
            <tr><td className="py-1">Classificação</td><td className="py-1 text-right" colSpan={3}>{p.classificacoes.map((c) => `${c.rotulo}: ${c.qtd}`).join(' · ')}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="sgo-type-17 mb-2 font-bold text-brand">Por unidade</h2>
        <table className="w-full border-collapse text-sm">
          <thead><tr className="border-b-2 border-brand text-left"><th className="py-1">Unidade</th><th className="py-1 text-right">Ativos</th><th className="py-1 text-right">Avaliações</th><th className="py-1 text-right">Cobertura</th><th className="py-1 text-right">Média</th><th className="py-1 text-right">Abaixo</th></tr></thead>
          <tbody>{p.porUnidade.map((u) => <tr key={u.unitId} className="border-b border-line"><td className="py-1">{u.unitName}</td><td className="py-1 text-right tabular-nums">{u.ativos}</td><td className="py-1 text-right tabular-nums">{u.avaliacoes}</td><td className="py-1 text-right tabular-nums">{pct(u.cobertura)}</td><td className="py-1 text-right tabular-nums">{fmtNota(u.media)}</td><td className="py-1 text-right tabular-nums">{u.abaixo}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="sgo-type-17 mb-2 font-bold text-brand">Por função</h2>
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b-2 border-brand text-left"><th className="py-1">Função</th><th className="py-1 text-right">Aval.</th><th className="py-1 text-right">Média</th><th className="py-1 text-right">Abaixo</th></tr></thead>
            <tbody>{p.porFuncao.map((f) => <tr key={f.funcao} className="border-b border-line"><td className="py-1">{f.funcao}</td><td className="py-1 text-right tabular-nums">{f.avaliacoes}</td><td className="py-1 text-right tabular-nums">{fmtNota(f.media)}</td><td className="py-1 text-right tabular-nums">{f.abaixo}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h2 className="sgo-type-17 mb-2 font-bold text-brand">Evolução mensal</h2>
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b-2 border-brand text-left"><th className="py-1">Mês</th><th className="py-1 text-right">Avaliações</th><th className="py-1 text-right">Média</th></tr></thead>
            <tbody>{p.evolucao.map((e) => <tr key={e.yearMonth} className="border-b border-line"><td className="py-1">{fmtMes(e.yearMonth)}</td><td className="py-1 text-right tabular-nums">{e.avaliacoes}</td><td className="py-1 text-right tabular-nums">{fmtNota(e.media)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="sgo-type-17 mb-2 font-bold text-brand">Critérios com maior dificuldade</h2>
        {p.criterios.length === 0 ? <p className="text-sm text-ink-500">Sem avaliações no formato por função no período.</p> : (
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b-2 border-brand text-left"><th className="py-1">Critério</th><th className="py-1 text-right">Média</th><th className="py-1 text-right">Respostas</th><th className="py-1 text-right">Notas 1–2</th></tr></thead>
            <tbody>{p.criterios.slice(0, 10).map((c) => <tr key={c.key} className="border-b border-line"><td className="py-1">{c.label}</td><td className="py-1 text-right tabular-nums">{fmtNota(c.media)}</td><td className="py-1 text-right tabular-nums">{c.respostas}</td><td className="py-1 text-right tabular-nums">{c.abaixo}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="sgo-type-17 mb-2 font-bold text-brand">Colaboradores abaixo do esperado</h2>
        {p.abaixoDoEsperado.length === 0 ? <p className="text-sm text-ink-500">Ninguém abaixo do esperado no período.</p> : (
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b-2 border-brand text-left"><th className="py-1">Colaborador</th><th className="py-1">Unidade</th><th className="py-1">Função</th><th className="py-1">Mês</th><th className="py-1 text-right">Nota</th><th className="py-1 text-right">Planos abertos</th></tr></thead>
            <tbody>{p.abaixoDoEsperado.map((a) => <tr key={a.collaboratorId} className="border-b border-line"><td className="py-1">{a.collaboratorName}</td><td className="py-1">{a.unitName}</td><td className="py-1">{a.funcao}</td><td className="py-1">{fmtMes(a.yearMonth)}</td><td className="py-1 text-right tabular-nums">{fmtNota(a.nota)}</td><td className="py-1 text-right tabular-nums">{a.planosAbertos}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="sgo-type-17 mb-2 font-bold text-brand">Planos de desenvolvimento</h2>
        {p.planos.lista.length === 0 ? <p className="text-sm text-ink-500">Nenhum plano no período.</p> : (
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b-2 border-brand text-left"><th className="py-1">Colaborador</th><th className="py-1">Critério</th><th className="py-1">Ação</th><th className="py-1">Responsável</th><th className="py-1">Prazo</th><th className="py-1">Situação</th></tr></thead>
            <tbody>{p.planos.lista.map((x) => <tr key={x.id} className="border-b border-line"><td className="py-1">{x.collaboratorName}</td><td className="py-1">{x.criterionLabel}</td><td className="py-1">{x.action}</td><td className="py-1">{x.responsibleName}</td><td className="py-1 tabular-nums">{br(x.dueDate)}</td><td className="py-1">{ROTULO_PLANO[x.situacao]}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      <p className="text-xs text-ink-500">Classificação: {Object.values(ROTULO_CLASSIFICACAO).join(' · ')}. Nota de 1,00 a 5,00; abaixo do esperado = última avaliação no período abaixo de 2,50.</p>
    </div>
  );
}
