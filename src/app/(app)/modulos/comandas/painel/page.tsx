import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, AlertTriangle, CalendarClock, ShieldAlert, PackageCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getPainelDeComandas } from '@/lib/commands/painel';
import { diaEmBrasilia } from '@/lib/metas/pontuacao';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const mesValido = (m: string | undefined) => (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null);
const nomeDoMes = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const deslocar = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Painel de comandas (v1.202.0): duas leituras que não se misturam.
 *  ROTINA — as conferências previstas foram feitas? (previstas, realizadas, atrasadas, pendentes)
 *  RESULTADO — o que a operação achou (divergências abertas, recuperadas, perdas definitivas).
 * Só leitura: composição de conferências, divergências e programação.
 */
export default async function PainelDeComandasPage({ searchParams }: { searchParams: { mes?: string } }) {
  const user = (await getSessionUser())!;
  if (!['SUPERVISOR', 'COORDINATOR', 'ADMIN', 'CEO'].includes(user.role)) {
    return <p className="text-sm text-ink-500">Restrito à supervisão.</p>;
  }
  const hojeBR = diaEmBrasilia(new Date());
  const mes = mesValido(searchParams.mes) ?? hojeBR.slice(0, 7);
  const linhas = await getPainelDeComandas(user, mes);

  const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((a, l) => a + f(l), 0);
  const previstas = soma((l) => l.rotina.previstas);
  const realizadas = soma((l) => l.rotina.realizadas);
  const atrasadas = soma((l) => l.rotina.atrasadas);
  const pendentes = soma((l) => l.rotina.pendentes);
  const fechadas = realizadas + atrasadas;
  const semCompleta = linhas.filter((l) => l.completa.overdue);

  return (
    <div className="space-y-4" data-testid="painel-comandas">
      <Link href="/modulos/comandas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden">
        <ArrowLeft className="h-4 w-4" /> Comandas
      </Link>
      <LargeTitle
        title="Painel de comandas"
        subtitle={`Rotina de conferência e resultado operacional — ${nomeDoMes(mes)}`}
        actions={
          <>
            <Link href={`/modulos/comandas/painel?mes=${deslocar(mes, -1)}`} className="sgo-btn">‹ Mês anterior</Link>
            {deslocar(mes, 1) <= hojeBR.slice(0, 7) && <Link href={`/modulos/comandas/painel?mes=${deslocar(mes, 1)}`} className="sgo-btn">Próximo mês ›</Link>}
          </>
        }
      />

      <p className="text-sm font-semibold text-ink-900">Rotina — as conferências previstas foram feitas?</p>
      <SgoKpis>
        <SgoKpi label="Previstas" value={previstas} icon={CalendarClock} meta="dias em que era para conferir" testId="kpi-previstas" />
        <SgoKpi label="Realizadas" value={realizadas} icon={ClipboardCheck} tone="green" meta={fechadas > 0 ? `${Math.round((realizadas / fechadas) * 100)}% dos dias fechados` : 'nenhum dia fechado'} testId="kpi-realizadas" />
        <SgoKpi label="Atrasadas" value={atrasadas} icon={AlertTriangle} tone={atrasadas > 0 ? 'red' : 'green'} meta="dia previsto que passou sem conferência" testId="kpi-atrasadas" />
        <SgoKpi label="Pendentes hoje" value={pendentes} icon={CalendarClock} meta="ainda dá tempo" testId="kpi-pendentes" />
      </SgoKpis>

      <p className="text-sm font-semibold text-ink-900">Resultado — o que a operação achou</p>
      <SgoKpis>
        <SgoKpi label="Divergências abertas" value={soma((l) => l.resultado.abertas)} icon={ShieldAlert} tone={soma((l) => l.resultado.abertas) > 0 ? 'amber' : 'green'} meta="em apuração agora" testId="kpi-abertas" />
        <SgoKpi label="Aguardando validação" value={soma((l) => l.resultado.aguardandoValidacao)} icon={ShieldAlert} meta="baixa encontrada: o supervisor valida" testId="kpi-validacao" />
        <SgoKpi label="Recuperadas no mês" value={soma((l) => l.resultado.recuperadas)} icon={ClipboardCheck} tone="green" testId="kpi-recuperadas" />
        <SgoKpi label="Perdas definitivas no mês" value={soma((l) => l.resultado.perdasDefinitivas)} icon={AlertTriangle} tone={soma((l) => l.resultado.perdasDefinitivas) > 0 ? 'red' : 'green'} testId="kpi-perdas" />
        <SgoKpi label="Reposições a receber" value={soma((l) => l.reposicoesPendentes)} icon={PackageCheck} meta="aguardando recebimento físico" testId="kpi-reposicoes" />
      </SgoKpis>

      {semCompleta.length > 0 && (
        <div className="rounded-lg border-2 border-warning bg-warning-bg p-3" data-testid="sem-completa-semanal">
          <p className="text-sm font-semibold text-warning">Sem conferência completa na semana ({semCompleta.length})</p>
          <p className="text-xs text-ink-700">
            {semCompleta.map((l) => `${shortUnitName(l.unitName)} (${l.completa.never ? 'nunca' : `há ${l.completa.days} dias`})`).join(' · ')}
          </p>
        </div>
      )}

      {linhas.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nenhuma unidade com comandas cadastradas" description="Cadastre as sequências em Configurações → Comandas." />
      ) : (
        <Card><CardContent className="overflow-x-auto pt-4">
          <table className="sgo-tbl w-full text-left text-sm">
            <thead>
              <tr>
                <th>Unidade</th><th>Previstas</th><th>Realizadas</th><th>Atrasadas</th><th>Pendentes</th><th>Cumprimento</th>
                <th>Abertas</th><th>A validar</th><th>Recuperadas</th><th>Perdas</th><th>Completa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.unitId} data-testid="linha-unidade">
                  <td className="font-medium">
                    <Link href={`/modulos/comandas?unit=${l.unitId}`} className="text-brand">{shortUnitName(l.unitName)}</Link>
                  </td>
                  <td className="tabular-nums">{l.rotina.previstas}</td>
                  <td className="tabular-nums">{l.rotina.realizadas}</td>
                  <td className={`tabular-nums ${l.rotina.atrasadas > 0 ? 'font-semibold text-danger' : ''}`}>{l.rotina.atrasadas}</td>
                  <td className="tabular-nums">{l.rotina.pendentes}</td>
                  <td className="tabular-nums">{l.rotina.cumprimentoPct === null ? '—' : `${l.rotina.cumprimentoPct}%`}</td>
                  <td className="tabular-nums">{l.resultado.abertas}</td>
                  <td className="tabular-nums">{l.resultado.aguardandoValidacao}</td>
                  <td className="tabular-nums">{l.resultado.recuperadas}</td>
                  <td className="tabular-nums">{l.resultado.perdasDefinitivas}</td>
                  <td>
                    <StatusBadge tone={l.completa.overdue ? 'warning' : 'success'}>
                      {l.completa.never ? 'Nunca' : l.completa.overdue ? `Há ${l.completa.days} dias` : 'Em dia'}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-500">
            Cumprimento = realizadas ÷ (realizadas + atrasadas): o dia de hoje só entra quando fechar. Previstas seguem a programação da unidade e as exceções por data (sem programação, todo dia é previsto).
            Perdas e recuperadas contam o mês em que foram decididas.
          </p>
        </CardContent></Card>
      )}

      <p className="text-xs text-ink-500">
        O cruzamento com as comandas em aberto do Teknisa segue em{' '}
        <Link href="/modulos/comandas/analise-aberto" className="font-semibold text-brand">Análise de comandas em aberto</Link>.
      </p>
    </div>
  );
}
