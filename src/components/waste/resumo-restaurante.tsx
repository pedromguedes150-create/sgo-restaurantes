import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { LeituraExecutiva, BarrasDeParticipacao } from '@/components/shared/leitura-executiva';
import { shortUnitName } from '@/lib/unit-name';
import type { AnaliseRestaurante } from '@/lib/waste/restaurante-executivo';

const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const p1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * O bloco EXECUTIVO das Sobras Restaurantes (v1.226.0): leitura do mês,
 * números e participação por grupo, turno, tipo e unidade. Fica ACIMA da
 * tabela de sempre (que continua sendo o discriminativo por unidade × tipo).
 * Só apresentação: a conta é de `analisarRestaurante`.
 */
export function ResumoRestaurante({ a, mes, anterior, acoes }: { a: AnaliseRestaurante; mes: string; anterior: string; acoes: ReactNode }) {
  const subiu = (a.variacaoDaMedia ?? 0) > 0;
  const estavel = a.variacaoDaMedia !== null && Math.abs(a.variacaoDaMedia) < 5;
  const cob = a.cobertura;
  return (
    <div className="space-y-4" data-testid="resumo-restaurante">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Relatório executivo de <b className="capitalize text-ink-900">{mes}</b> · quilos de sobra do restaurante (não se soma com as unidades da lanchonete).</p>
        {acoes}
      </div>

      <LeituraExecutiva titulo="Leitura do mês" frases={a.leituras} />

      <SgoKpis>
        <SgoKpi label="Total de sobra" value={`${kg(a.total)} kg`} meta={`${a.diasLancados} dia(s) lançado(s)`} testId="kpi-total" />
        <SgoKpi label="Média por dia lançado" value={a.mediaPorDia === null ? '—' : `${kg(a.mediaPorDia)} kg`} meta={a.anterior.mediaPorDia === null ? `sem base em ${anterior}` : `${anterior}: ${kg(a.anterior.mediaPorDia)} kg/dia`} testId="kpi-media" />
        <SgoKpi
          label="Variação da média/dia"
          value={a.variacaoDaMedia === null ? '—' : estavel ? 'Estável' : `${subiu ? '▲' : '▼'} ${p1(Math.abs(a.variacaoDaMedia))}%`}
          valueColor={a.variacaoDaMedia === null || estavel ? undefined : subiu ? 'var(--sgo-bad)' : 'var(--sgo-ok)'}
          meta={a.variacaoDoTotal === null ? 'sem base de comparação' : `total: ${kg(a.anterior.total)} → ${kg(a.total)} kg`}
          testId="kpi-variacao"
        />
        <SgoKpi
          label="Cobertura dos lançamentos"
          value={cob === null ? '—' : `${Math.round(cob * 100)}%`}
          valueColor={cob !== null && cob < 0.8 ? 'var(--sgo-warn)' : undefined}
          meta={`${a.diasLancados} de ${a.diasEsperados} · ${a.unidadesQueLancaram} de ${a.unidadesNoEscopo} unidades`}
          testId="kpi-cobertura"
        />
      </SgoKpis>

      {a.baseFraca && (
        <p className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg p-2 text-sm text-warning" data-testid="aviso-base-fraca">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>O total não é comparável com {anterior}:</b> lá foram {a.anterior.diasLancados} dia(s) lançado(s), agora {a.diasLancados}. Leia a variação pela média por dia lançado.</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <BarrasDeParticipacao testId="barras-grupo" titulo="Limpa × Produção" itens={a.porGrupo.map((g) => ({ rotulo: g.nome, valor: `${kg(g.kg)} kg`, pct: g.pct }))} nota="Sobra limpa é o que voltou do self-service; sobra de produção é o que foi feito e não saiu." />
          <BarrasDeParticipacao testId="barras-turno" titulo="Por turno" itens={a.porTurno.map((t) => ({ rotulo: t.nome, valor: `${kg(t.kg)} kg`, pct: t.pct }))} />
          <BarrasDeParticipacao testId="barras-tipo" titulo="Por tipo de sobra" itens={a.porTipo.map((t) => ({ rotulo: t.nome, valor: `${kg(t.kg)} kg`, pct: t.pct }))} vazio="Sem lançamentos no mês." />
        </div>
        <BarrasDeParticipacao
          testId="barras-unidades"
          titulo="Participação por unidade"
          itens={a.porUnidade.filter((u) => u.kg > 0).map((u) => ({ rotulo: shortUnitName(u.unitName), valor: `${kg(u.kg)} kg`, pct: u.pct, apoio: `${u.dias}/${u.diasDecorridos} dias · ${u.media === null ? '—' : kg(u.media)} kg/dia` }))}
          vazio="Sem lançamentos no mês."
          nota="Ao lado do nome: dias lançados sobre dias decorridos e a média por dia lançado. Unidade com poucos dias lançados tem o peso subestimado."
        />
      </div>
    </div>
  );
}
