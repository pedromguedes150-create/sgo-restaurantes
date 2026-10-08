import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';
import { PrintButton } from '@/components/ui/print-button';
import { AutoPrint } from '@/components/shared/auto-print';
import { getUsoDoSgo } from '@/lib/metas/uso';
import { ROTULO_FAIXA_USO } from '@/lib/metas/uso-calculo';
import { TabelaUnidades, TabelaUsuarios } from '@/components/metas/uso-do-sgo';

export const dynamic = 'force-dynamic';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Uso do SGO em PDF pela impressão (v1.164.0) — mesma leitura da aba. */
export default async function UsoRelatorioPage({ searchParams }: { searchParams: { month?: string; imprimir?: string } }) {
  const user = (await getSessionUser())!;
  const perms = await permissoesEfetivasDoRequest(user.role);
  if (!perms.METAS?.canView || !(user.seesAllUnits || user.role === 'SUPERVISOR')) return <p className="text-sm text-ink-500">Acesso restrito.</p>;
  const ym = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : new Date().toISOString().slice(0, 7);
  const d = await getUsoDoSgo(user, ym);
  const r = d.resumo;
  const [y, m] = ym.split('-').map(Number);
  const hoje = new Date().toLocaleDateString('pt-BR');

  return (
    <div className="sgo-print mx-auto max-w-6xl space-y-6 bg-surface p-4 text-ink-900 print:p-0">
      {searchParams.imprimir === '1' && <AutoPrint />}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/metas?aba=uso&month=${ym}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Uso do SGO</Link>
        <PrintButton label="Salvar PDF" />
      </div>
      <header className="border-b-4 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR</p>
        <h1 className="text-2xl font-bold text-ink-900">USO DO SGO — {MESES[m - 1].toUpperCase()}/{y}</h1>
        <p className="text-sm text-ink-700">{d.unidades.length} unidade(s) · {d.usuarios.length} usuário(s) medido(s) · emitido em {hoje}</p>
      </header>

      <section>
        <h2 className="sgo-type-17 mb-2 font-bold text-brand">Resumo</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-line"><td className="py-1">Uso médio da rede</td><td className="py-1 text-right tabular-nums">{r.mediaUso ?? '—'}%</td><td className="py-1 pl-6">Usuários ativos</td><td className="py-1 text-right tabular-nums">{r.usuariosAtivos} de {d.usuarios.length}</td></tr>
            <tr className="border-b border-line"><td className="py-1">Ações no sistema</td><td className="py-1 text-right tabular-nums">{r.totalAcoes}</td><td className="py-1 pl-6">Acessos</td><td className="py-1 text-right tabular-nums">{r.totalAcessos}</td></tr>
            <tr className="border-b border-line"><td className="py-1">Tarefas no prazo</td><td className="py-1 text-right tabular-nums">{r.tarefas.done} ({r.tarefas.pctNoPrazo ?? '—'}%)</td><td className="py-1 pl-6">Fora do prazo · não realizadas</td><td className="py-1 text-right tabular-nums">{r.tarefas.late} · {r.tarefas.missed}</td></tr>
            <tr><td className="py-1">Faixas de uso</td><td className="py-1 text-right" colSpan={3}>{r.porFaixa.map((f) => `${ROTULO_FAIXA_USO[f.faixa]}: ${f.qtd}`).join(' · ')}</td></tr>
          </tbody>
        </table>
        <ul className="mt-2 space-y-1 text-sm">
          <li><b>Unidade que mais usa:</b> {r.unidadeMaisUsa ? `${r.unidadeMaisUsa.unitName} (${r.unidadeMaisUsa.usagePct}%)` : '—'} · <b>que menos usa:</b> {r.unidadeMenosUsa ? `${r.unidadeMenosUsa.unitName} (${r.unidadeMenosUsa.usagePct}%)` : '—'}</li>
          <li><b>Mais deixa de fazer:</b> {r.unidadeMaisDeixaDeFazer ? `${r.unidadeMaisDeixaDeFazer.unitName} (${r.unidadeMaisDeixaDeFazer.missed} não realizadas · ${r.unidadeMaisDeixaDeFazer.taxa}%)` : 'nenhuma'} · <b>mais erra o prazo:</b> {r.unidadeMaisErra ? `${r.unidadeMaisErra.unitName} (${r.unidadeMaisErra.taxa}%)` : 'nenhuma'}</li>
          <li><b>Usuário que mais usa:</b> {r.maisUsam[0] ? `${r.maisUsam[0].name} (${r.maisUsam[0].acoes} ações)` : '—'} · <b>sem nenhuma ação:</b> {r.usuariosSemUso.length ? r.usuariosSemUso.map((u) => u.name).join(', ') : 'ninguém'}</li>
        </ul>
      </section>

      <section>
        <h2 className="sgo-type-17 mb-2 font-bold text-brand">Rede, unidade por unidade</h2>
        <TabelaUnidades unidades={d.unidades} />
      </section>
      <section className="break-before-page">
        <h2 className="sgo-type-17 mb-2 font-bold text-brand">Usuário por usuário</h2>
        <TabelaUsuarios usuarios={d.usuarios} />
        <p className="mt-2 text-xs text-ink-500">Uso = média de checklists, cobertura de desperdício e de comandas (painel do supervisor). Ações = registros na Auditoria no mês, sem login. Tarefas = checklists concluídos por esse usuário.</p>
      </section>
    </div>
  );
}
