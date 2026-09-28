import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';
import { PrintButton } from '@/components/ui/print-button';
import { AutoPrint } from '@/components/shared/auto-print';
import { gerentesPorUnidade, hojeNaOperacao, unidadesDoControle } from '@/lib/controle-gerentes-dados';
import { DIA_CURTO, MESES, SIGLA, ddmmaaaa, diasDoMes, montarGrade, resumoDaUnidade } from '@/lib/controle-gerentes';

export const dynamic = 'force-dynamic';

/**
 * ESCALA MENSAL DE GERENTES — PDF pela impressão, para a diretoria.
 *
 * "Todas as unidades" NÃO junta as escalas: cada unidade sai no SEU quadro,
 * numerado, uma por página. É a rede apresentada sem apagar a individualidade
 * operacional de cada unidade.
 */
export default async function EscalaMensalPdfPage({ searchParams }: { searchParams: { ano?: string; mes?: string; unit?: string; imprimir?: string } }) {
  const user = (await getSessionUser())!;
  const perms = await permissoesEfetivasDoRequest(user.role);
  if (!perms.LEAVES_TEAM?.canView) return <p className="text-sm text-ink-500">Acesso restrito.</p>;

  const hoje = hojeNaOperacao();
  const year = Number(searchParams.ano) || Number(hoje.slice(0, 4));
  const month = Math.min(12, Math.max(1, Number(searchParams.mes) || Number(hoje.slice(5, 7))));
  const todas = await unidadesDoControle(user);
  const units = searchParams.unit && searchParams.unit !== 'todas' ? todas.filter((u) => u.id === searchParams.unit) : todas;

  const dias = diasDoMes(year, month);
  const porUnidade = await gerentesPorUnidade(units.map((u) => u.id), dias[0].iso, dias[dias.length - 1].iso);
  const titulo = `${MESES[month - 1].toUpperCase()}/${year}`;

  return (
    <div className="sgo-print mx-auto max-w-5xl space-y-6 bg-surface p-4 text-ink-900 print:p-0">
      {searchParams.imprimir === '1' && <AutoPrint />}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/folgas-equipe?ano=${year}&mes=${month}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Controle de gerentes</Link>
        <PrintButton label="Salvar PDF" />
      </div>

      <header className="border-b-4 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR</p>
        <h1 className="text-2xl font-bold text-ink-900">CONTROLE DE GERENTES — {titulo}</h1>
        <p className="text-sm text-ink-700">
          {units.length === 1 ? units[0].name : `${units.length} unidades — um quadro por unidade`} · emitido em {ddmmaaaa(hoje)}
        </p>
        <p className="mt-1 text-xs text-ink-500">F = folga · FE = férias · – = sem folga. Dia em destaque vermelho = nenhum gerente trabalhando.</p>
      </header>

      {units.length === 0 && <p className="text-sm text-ink-500">Nenhuma unidade no seu escopo.</p>}

      {units.map((u, idx) => {
        const gerentes = porUnidade.get(u.id) ?? [];
        const grade = montarGrade(gerentes, year, month);
        const r = resumoDaUnidade(gerentes, year, month, hoje);
        return (
          <section key={u.id} className={idx > 0 ? 'break-before-page' : ''}>
            <h2 className="sgo-type-17 mb-1 font-bold text-brand">{idx + 1}. {u.name}</h2>
            <p className="mb-2 text-xs text-ink-700">
              Gerentes ativos: <b>{r.gerentesAtivos}</b> · Folgas no mês: <b>{r.folgasNoMes}</b> · Em férias no mês: <b>{r.gerentesDeFerias}</b>
            </p>
            {grade.linhas.length === 0 ? (
              <p className="text-sm text-ink-500">Nenhum gerente vinculado a esta unidade.</p>
            ) : (
              <table className="w-full border-collapse text-center text-[10px]">
                <thead>
                  <tr className="border-b-2 border-brand">
                    <th className="py-1 pr-1 text-left font-semibold text-ink-700">Gerente</th>
                    {grade.dias.map((d) => (
                      <th key={d.iso} className={`px-0 py-1 font-semibold ${d.semGerente ? 'bg-danger/15 text-danger' : 'text-ink-700'}`}>
                        <span className="block tabular-nums">{String(d.day).padStart(2, '0')}</span>
                        <span className="block font-normal">{DIA_CURTO[d.weekday]}</span>
                      </th>
                    ))}
                    <th className="px-1 py-1 font-semibold text-ink-700">F/FE</th>
                  </tr>
                </thead>
                <tbody>
                  {grade.linhas.map((l) => (
                    <tr key={l.userId} className="border-b border-line">
                      <td className="whitespace-nowrap py-1 pr-1 text-left font-medium text-ink-900">{l.name}</td>
                      {l.dias.map((m, i) => (
                        <td key={i} className={`px-0 py-1 font-bold ${m === 'FOLGA' ? 'text-brand' : m === 'FERIAS' ? 'text-info' : 'font-normal text-ink-400'}`}>
                          {m ? SIGLA[m] : '–'}
                        </td>
                      ))}
                      <td className="px-1 py-1 tabular-nums text-ink-700">{l.folgas}/{l.ferias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <p className="pt-2 text-center text-[10px] text-ink-500">Gerado pelo SGO Beija Flor em {ddmmaaaa(hoje)}</p>
    </div>
  );
}
