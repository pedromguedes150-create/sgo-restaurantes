import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { contagensEnviadas } from '@/lib/utensilios/inventario';
import { relacaoPorUnidade } from '@/lib/utensilios/evolucao';
import { LargeTitle } from '@/components/layout/page-chrome';
import { AutoPrint } from '@/components/shared/auto-print';

export const dynamic = 'force-dynamic';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const br = (iso: string) => iso.split('-').reverse().join('/');
const n = (v: number) => v.toLocaleString('pt-BR');
const dia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * RELAÇÃO DE UTENSÍLIOS (v1.219.0) — o PDF: por unidade, um utensílio por
 * linha e uma coluna por local (Restaurante, Lanchonete…), com a contagem
 * enviada mais recente de cada local no período. `?imprimir=1` abre direto no
 * diálogo de impressão. Só o que está no alcance do usuário.
 */
export default async function RelacaoDeUtensiliosPage({ searchParams }: { searchParams: { unit?: string; unidade?: string; de?: string; ate?: string; imprimir?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, select: { id: true } });
  const ids = units.map((u) => u.id);
  const filtro = resolveUnitFilter(searchParams, ids, getSelectedUnitId(ids));
  const hoje = hojeNaOperacao();
  const de = DIA.test(searchParams.de ?? '') ? searchParams.de! : `${hoje.slice(0, 4)}-01-01`;
  const ate = DIA.test(searchParams.ate ?? '') ? searchParams.ate! : hoje;
  const imprimir = searchParams.imprimir === '1';

  const relacao = relacaoPorUnidade(await contagensEnviadas(user, { unitIds: filtro.all ? undefined : filtro.ids, de, ate }));
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ unit: searchParams.unit, unidade: searchParams.unidade, de, ate })) if (v) p.set(k, v);

  return (
    <div className={`space-y-4 ${imprimir ? 'sgo-print' : ''}`} data-testid="relacao-utensilios">
      {imprimir && <AutoPrint />}
      <Link href="/modulos/inventario-utensilios?aba=historico" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Inventário de Utensílios</Link>
      <LargeTitle
        title="Relação de utensílios"
        subtitle={`Contagem enviada mais recente de cada local · ${br(de)} a ${br(ate)}`}
        actions={!imprimir ? <a href={`/modulos/inventario-utensilios/relatorio?${p.toString()}&imprimir=1`} target="_blank" rel="noreferrer" className="sgo-btn sgo-btn--sm"><Printer className="h-4 w-4" /> Imprimir / PDF</a> : undefined}
      />
      {relacao.length === 0 && <p className="sgo-panel sgo-panel--solid p-3 text-sm text-ink-500 sm:p-4">Nenhum inventário enviado no período.</p>}
      {relacao.map((u) => (
        <section key={u.unitId} className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="relacao-unidade">
          <p className="sgo-panel__title px-3 pt-3 sm:px-4">{u.unidade} · total <span className="tabular-nums">{n(u.total)}</span></p>
          <p className="px-3 pb-2 text-xs text-ink-500 sm:px-4">{u.colunas.map((c) => `${c.local}: ${dia(c.quando)} · ${c.managerName}`).join('  |  ')}</p>
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead><tr>
                <th className="text-left">Utensílio</th>
                {u.colunas.map((c) => <th key={c.local} className="text-right">{c.local}</th>)}
                {u.colunas.length > 1 && <th className="text-right">Total</th>}
              </tr></thead>
              <tbody>
                {u.linhas.map((l) => (
                  <tr key={l.name}>
                    <td className="whitespace-normal font-medium text-ink-900">{l.name}</td>
                    {l.porLocal.map((q, i) => <td key={u.colunas[i].local} className="text-right tabular-nums">{q === null ? '—' : n(q)}</td>)}
                    {u.colunas.length > 1 && <td className="text-right tabular-nums font-semibold">{n(l.total)}</td>}
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold text-ink-900">Total</td>
                  {u.colunas.map((c) => <td key={c.local} className="text-right tabular-nums font-semibold">{n(c.total)}</td>)}
                  {u.colunas.length > 1 && <td className="text-right tabular-nums font-semibold">{n(u.total)}</td>}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
