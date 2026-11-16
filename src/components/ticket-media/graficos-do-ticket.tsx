import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Rosca, Legenda } from '@/components/metas/graficos-metas';
import { shortUnitName } from '@/lib/unit-name';
import { emNumero, emPercentual, emReal, rotuloDaCompetencia, type Competencia } from '@/lib/ticket-media/calculo';
import { ordemPorReceita, participacao, rankingDoTicket, MAX_FATIAS, type FatiaDeParticipacao } from '@/lib/ticket-media/graficos';
import type { PainelDoTicket } from '@/lib/ticket-media/query';

/**
 * Os gráficos de gestão do Ticket Médio (v1.209.0): quem faz a receita, quem
 * traz os cupons, como está o fechamento do mês e o ticket de cada unidade
 * contra o consolidado. Só lê o painel — nenhuma conta nova.
 */

/* Paleta por token: a 1ª fatia é a marca; "Outras" é o cinza. */
const CORES = [
  'var(--sgo-brand)',
  'var(--sgo-sky)',
  'var(--sgo-violet)',
  'var(--sgo-ok)',
  'var(--sgo-warn)',
  'color-mix(in srgb, var(--sgo-brand) 45%, var(--sgo-surface))',
  'color-mix(in srgb, var(--sgo-sky) 50%, var(--sgo-surface))',
  'var(--sgo-ink-3)',
];
const cor = (i: number) => CORES[Math.min(i, MAX_FATIAS)];
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function Titulo({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="sgo-type-11 font-semibold uppercase text-ink-900">{children}</p>
      {sub && <p className="text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

function RoscaDeParticipacao({ titulo, sub, fatias, centro, rotuloDoCentro, formatar, testId }: {
  titulo: string; sub: string; fatias: FatiaDeParticipacao[]; centro: string; rotuloDoCentro: string; formatar: (v: number) => string; testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4">
        <Titulo sub={sub}>{titulo}</Titulo>
        <div className="flex flex-wrap items-center gap-4">
          <Rosca
            fatias={fatias.map((f) => ({ rotulo: shortUnitName(f.name), valor: f.valor, cor: cor(f.cor), detalhe: pct(f.pct) }))}
            centro={<span className="sgo-type-17">{centro}</span>}
            sub={rotuloDoCentro}
          />
          <div className="min-w-[12rem] flex-1">
            <Legenda itens={fatias.map((f) => ({ cor: cor(f.cor), rotulo: shortUnitName(f.name), valor: <>{pct(f.pct)} <span className="font-normal text-ink-500">· {formatar(f.valor)}</span></> }))} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function GraficosDoTicket({ painel, competencia, ultimaComDados }: { painel: PainelDoTicket; competencia: Competencia; ultimaComDados: Competencia | null }) {
  if (painel.participantes === 0) return null;

  const ordem = ordemPorReceita(painel.linhas);
  const porReceita = participacao(painel.linhas, 'receita', ordem);
  const porCupons = participacao(painel.linhas, 'coupons', ordem);
  const ranking = rankingDoTicket(painel.linhas, painel.total.ticket);
  const pendentes = painel.participantes - painel.importadas;
  const temDados = painel.importadas > 0;

  return (
    <div className="space-y-4" data-testid="graficos-do-ticket">
      <div className={`grid grid-cols-1 gap-4 ${temDados && painel.linhas.length > 1 ? 'xl:grid-cols-3' : ''}`}>
        {/* Fechamento do mês: sempre aparece — é o que diz se os outros gráficos já valem. */}
        <Card data-testid="rosca-importacoes">
          <CardContent className="pt-4">
            <Titulo sub={`Planilhas de ${rotuloDaCompetencia(competencia)} já importadas.`}>Fechamento do mês</Titulo>
            <div className="flex flex-wrap items-center gap-4">
              <Rosca
                fatias={[
                  { rotulo: 'Importadas', valor: painel.importadas, cor: 'var(--sgo-ok)' },
                  { rotulo: 'Pendentes', valor: pendentes, cor: 'var(--sgo-warn)' },
                ]}
                centro={`${painel.importadas}/${painel.participantes}`}
                sub="unidades"
              />
              <div className="min-w-[12rem] flex-1 space-y-2">
                <Legenda itens={[
                  { cor: 'var(--sgo-ok)', rotulo: 'Importadas', valor: painel.importadas },
                  { cor: 'var(--sgo-warn)', rotulo: 'Pendentes', valor: pendentes },
                ]} />
                {pendentes > 0 && (
                  <p className="break-words text-xs text-ink-500">Falta: {painel.pendentes.map((p) => shortUnitName(p.name)).join(', ')}.</p>
                )}
                {!temDados && ultimaComDados && ultimaComDados !== competencia && (
                  <p className="text-xs text-ink-700">
                    Sem importação neste mês ainda.{' '}
                    <Link href={`/modulos/ticket-medio?competencia=${ultimaComDados}`} className="sgo-link" data-testid="ver-ultimo-mes">
                      Ver {rotuloDaCompetencia(ultimaComDados)} →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {temDados && painel.linhas.length > 1 && (
          <>
            <RoscaDeParticipacao
              testId="rosca-receita"
              titulo="Participação na receita"
              sub="Quanto cada unidade representa da receita das importadas."
              fatias={porReceita}
              centro={emReal(painel.total.receita)}
              rotuloDoCentro="receita"
              formatar={emReal}
            />
            <RoscaDeParticipacao
              testId="rosca-cupons"
              titulo="Participação nos cupons"
              sub="Quanto cada unidade representa do movimento (cupons)."
              fatias={porCupons}
              centro={emNumero(painel.total.coupons)}
              rotuloDoCentro="cupons"
              formatar={emNumero}
            />
          </>
        )}
      </div>

      {ranking.barras.length > 1 && (
        <Card data-testid="ranking-do-ticket">
          <CardContent className="pt-4">
            <Titulo sub={<>Do maior para o menor. A linha marca o consolidado ({emReal(painel.total.ticket)}); ao lado, a distância de cada unidade para ele e a variação contra {rotuloDaCompetencia(painel.anterior)}.</>}>
              Ticket médio por unidade
            </Titulo>
            <ul className="space-y-2">
              {ranking.barras.map((b) => {
                const acima = (b.vsConsolidado ?? 0) >= 0;
                return (
                  <li key={b.unitId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="w-full min-w-0 break-words text-sm text-ink-900 sm:w-48">{shortUnitName(b.name)}</span>
                    <div className="relative h-5 min-w-[8rem] flex-1 rounded bg-sunken">
                      <div className="h-full rounded" style={{ width: `${b.largura}%`, background: acima ? 'var(--sgo-ok)' : 'var(--sgo-warn)' }} />
                      {ranking.marcaDoConsolidado != null && (
                        <span className="absolute inset-y-0 w-0.5 bg-ink-900" style={{ left: `${ranking.marcaDoConsolidado}%` }} aria-hidden />
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">{emReal(b.ticket)}</span>
                    <span className={`shrink-0 text-xs tabular-nums ${acima ? 'text-success' : 'text-warning'}`}>
                      {b.vsConsolidado == null ? '' : `${b.vsConsolidado > 0 ? '+' : ''}${pct(b.vsConsolidado)} vs. consolidado`}
                    </span>
                    <span className={`shrink-0 text-xs tabular-nums ${b.variacaoTicket == null ? 'text-ink-400' : b.variacaoTicket > 0 ? 'text-success' : b.variacaoTicket < 0 ? 'text-danger' : 'text-ink-400'}`}>
                      {b.variacaoTicket == null ? 'sem mês anterior' : `${b.variacaoTicket > 0 ? '↑' : b.variacaoTicket < 0 ? '↓' : '—'} ${emPercentual(b.variacaoTicket)} no mês`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
