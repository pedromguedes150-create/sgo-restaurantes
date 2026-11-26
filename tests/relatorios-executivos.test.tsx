import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { analisarSalgados, type DescarteDoMes } from '@/lib/waste/salgados-executivo';
import { analisarConsolidado, diaDaSemanaSegDom } from '@/lib/payments/consolidado-executivo';
import { lerFiltroConsolidado, queryDoFiltroConsolidado, type Consolidado, type LinhaDoConsolidado } from '@/lib/payments/consolidado-tipos';
import { ResumoSalgados } from '@/components/waste/resumo-salgados';
import { regraDaRota } from '@/lib/permissions/guarda-rota-api';

const UNIDADES = [{ id: 'a', name: 'Unidade A' }, { id: 'b', name: 'Unidade B' }, { id: 'c', name: 'Unidade C' }];
const d = (unitId: string, dia: string, typeName: string, reasonName: string, quantity: number): DescarteDoMes =>
  ({ unitId, unitName: UNIDADES.find((u) => u.id === unitId)!.name, operationalDate: dia, typeName, reasonName, quantity });

describe('Sobras Lanchonete — leitura executiva', () => {
  const doMes = [
    d('a', '2026-11-01', 'Pão', 'Sobra do dia', 30),
    d('a', '2026-11-02', 'Pão', 'Mofado', 10),
    d('a', '2026-11-02', 'Coxinha', 'Sobra do dia', 20),
    d('b', '2026-11-02', 'Coxinha', 'Quebrado', 40),
  ];

  it('soma, fatias e média por dia lançado (cada unidade conta os seus dias)', () => {
    const a = analisarSalgados(doMes, [], UNIDADES);
    expect(a.total).toBe(100);
    expect(a.diasLancados).toBe(3); // A: 2 dias, B: 1 dia
    expect(a.mediaPorDia).toBeCloseTo(33.33, 1);
    expect(a.unidadesQueLancaram).toBe(2);
    expect(a.unidadesNoEscopo).toBe(3);
    expect(a.porTipo.map((t) => [t.name, t.qty, Math.round(t.pct)])).toEqual([['Coxinha', 60, 60], ['Pão', 40, 40]]);
    expect(a.porMotivo[0]).toMatchObject({ name: 'Sobra do dia', qty: 50 });
    expect(a.porUnidade.map((u) => [u.unitName, u.total, u.dias])).toEqual([['Unidade A', 60, 2], ['Unidade B', 40, 1], ['Unidade C', 0, 0]]);
    expect(a.porUnidade[2].media).toBeNull();
  });

  it('os cruzamentos fecham com o total, e unidade sem lançamento não vira linha zerada', () => {
    const a = analisarSalgados(doMes, [], UNIDADES);
    expect(a.unidadeXMotivo.total).toBe(100);
    expect(a.unidadeXMotivo.linhas.map((l) => l.rotulo)).toEqual(['Unidade A', 'Unidade B']);
    expect(a.unidadeXMotivo.totais.reduce((s, n) => s + n, 0)).toBe(100);
    expect(a.tipoXMotivo.linhas.find((l) => l.rotulo === 'Coxinha')!.total).toBe(60);
    expect(a.porDia).toEqual([{ dia: '2026-11-01', total: 30, unidades: 1 }, { dia: '2026-11-02', total: 70, unidades: 2 }]);
  });

  it('compara pela MÉDIA por dia lançado: mês anterior quase sem registro não vira "subiu 1.484%"', () => {
    const anterior = [d('a', '2026-10-30', 'Pão', 'Sobra do dia', 40)]; // 1 dia, 40 un./dia
    const a = analisarSalgados(doMes, anterior, UNIDADES, { mes: 'novembro', anterior: 'outubro' });
    expect(Math.round(a.variacaoDoTotal!)).toBe(150); // 40 → 100
    expect(Math.round(a.variacaoDaMedia!)).toBe(-17); // 40 → 33,3 un./dia
    expect(a.baseFraca).toBe(true);
    expect(a.leituras.join(' ')).toContain('caiu');
    expect(a.leituras.join(' ')).toContain('mais lançamento');
  });

  it('sem mês anterior não inventa percentual; mês vazio diz que é falta de lançamento', () => {
    const a = analisarSalgados(doMes, [], UNIDADES, { mes: 'novembro', anterior: 'outubro' });
    expect(a.variacaoDaMedia).toBeNull();
    expect(a.variacaoDoTotal).toBeNull();
    expect(a.baseFraca).toBe(false);
    const vazio = analisarSalgados([], [], UNIDADES, { mes: 'novembro', anterior: 'outubro' });
    expect(vazio.mediaPorDia).toBeNull();
    expect(vazio.leituras[0]).toContain('falta de lançamento');
  });

  it('a tela mostra a leitura, os números, as barras, os cruzamentos e os dois downloads', () => {
    const a = analisarSalgados(doMes, [d('a', '2026-10-30', 'Pão', 'Sobra do dia', 40)], UNIDADES, { mes: 'novembro', anterior: 'outubro' });
    const html = renderToString(<ResumoSalgados a={a} mes="novembro de 2026" anterior="outubro" evolucao={null} acoes={<a data-testid="baixar-excel" href="/x">Excel</a>} rodape={null} />);
    for (const id of ['leitura-executiva', 'kpi-total', 'kpi-media', 'kpi-variacao', 'kpi-cobertura', 'aviso-base-fraca', 'barras-tipos', 'barras-motivos', 'barras-unidades', 'tabela-unidades', 'matriz-unidade-motivo', 'matriz-tipo-motivo', 'baixar-excel']) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    expect(html).toContain('2 de 3');
    expect(html).toContain('Unidade C');
  });
});

const linha = (over: Partial<LinhaDoConsolidado>): LinhaDoConsolidado => ({
  id: Math.random().toString(36).slice(2), data: '2026-11-02', unitId: 'a', unidade: 'Unidade A', tipo: 'FREELANCER', tipoLabel: 'Freelancer',
  status: 'PAID', statusLabel: 'Pago', valor: 100, pessoa: 'Fulano', freelancerId: 'f1', recorrente: false,
  setor: 'Salão', horario: '18:00–23:00', motivo: null, solicitadoPor: 'Gerente', ...over,
});

function consolidado(linhas: LinhaDoConsolidado[], over: Partial<Consolidado> = {}): Consolidado {
  const validas = linhas.filter((l) => l.status !== 'REJECTED');
  const total = validas.reduce((s, l) => s + l.valor, 0);
  const porF = new Map<string, LinhaDoConsolidado[]>();
  for (const l of linhas) if (l.freelancerId) porF.set(l.freelancerId, [...(porF.get(l.freelancerId) ?? []), l]);
  const porU = new Map<string, LinhaDoConsolidado[]>();
  for (const l of linhas) porU.set(l.unidade, [...(porU.get(l.unidade) ?? []), l]);
  return {
    periodo: { de: '2026-11-01', ate: '2026-11-30', rotulo: 'novembro/2026', tipo: 'mes' },
    limiteSemanal: 2,
    resumo: {
      solicitacoes: linhas.length, freelancersUnicos: porF.size, recorrentes: 0, valorSolicitado: total,
      valorAprovadoPago: validas.filter((l) => l.status !== 'PENDING').reduce((s, l) => s + l.valor, 0),
      rejeitadasCount: linhas.length - validas.length, rejeitadasValor: linhas.filter((l) => l.status === 'REJECTED').reduce((s, l) => s + l.valor, 0),
      mediaPorUnidade: 0, unidadesNoEscopo: porU.size,
    },
    comparacao: { anterior: { de: '2026-10-01', ate: '2026-10-31', rotulo: 'outubro/2026', tipo: 'mes' }, solicitacoesAntes: 2, variacaoPct: 0, valorAntes: 200, variacaoValorPct: ((total - 200) / 200) * 100 },
    recorrentesNaSemana: [],
    porUnidade: [...porU.entries()].map(([nome, xs]) => {
      const v = xs.filter((l) => l.status !== 'REJECTED').reduce((s, l) => s + l.valor, 0);
      return { unitId: xs[0].unitId, nome, solicitacoes: xs.length, unicos: 0, recorrentes: 0, valor: v, pctRede: total ? (v / total) * 100 : 0 };
    }).sort((x, y) => y.valor - x.valor),
    evolucao: { granularidade: 'semana', pontos: [] },
    freelancers: [...porF.entries()].map(([freelancerId, xs]) => ({
      freelancerId, nome: xs[0].pessoa, cpf: null, pixKey: null, solicitacoes: xs.length,
      valor: xs.filter((l) => l.status !== 'REJECTED').reduce((s, l) => s + l.valor, 0),
      recorrente: xs.some((l) => l.recorrente), rejeitadas: xs.filter((l) => l.status === 'REJECTED').length, unidades: [...new Set(xs.map((l) => l.unidade))], linhas: xs,
    })),
    linhas,
    ...over,
  };
}

describe('Recorrência de Freelancers — leitura executiva', () => {
  const linhas = [
    linha({ valor: 100, status: 'PAID', statusLabel: 'Pago', data: '2026-11-02' }), // segunda
    linha({ valor: 100, status: 'APPROVED', statusLabel: 'Aprovado', data: '2026-11-07', recorrente: true }), // sábado
    linha({ valor: 100, status: 'PENDING', statusLabel: 'Pendente', data: '2026-11-07', recorrente: true }),
    linha({ valor: 300, status: 'PAID', statusLabel: 'Pago', data: '2026-11-07', freelancerId: 'f2', pessoa: 'Beltrano', unidade: 'Unidade B', unitId: 'b', setor: null }),
    linha({ valor: 999, status: 'REJECTED', statusLabel: 'Rejeitado', data: '2026-11-08', freelancerId: 'f2', pessoa: 'Beltrano', unidade: 'Unidade B', unitId: 'b' }),
  ];

  it('rejeitada fica fora do valor, do valor médio e das fatias', () => {
    const a = analisarConsolidado(consolidado(linhas));
    expect(a.ticketMedio).toBe(150); // 600 ÷ 4
    expect(a.valorPorFreelancer).toBe(300); // 600 ÷ 2
    const rej = a.porStatus.find((s) => s.rotulo.startsWith('Rejeitado'))!;
    expect(rej).toMatchObject({ qtd: 1, valor: 999, pct: 0 });
    expect(a.porStatus.filter((s) => !s.rotulo.startsWith('Rejeitado')).reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 5);
  });

  it('recorrência, concentração, dia da semana e setor saem das mesmas linhas', () => {
    const a = analisarConsolidado(consolidado(linhas));
    expect(a.recorrencia).toMatchObject({ pessoas: 1, solicitacoes: 3, valor: 300 });
    expect(a.recorrencia.pctDoValor).toBe(50);
    /* Empate em valor: vem primeiro quem tem mais solicitações. */
    expect(a.topFreelancers.map((t) => [t.rotulo, t.valor, t.qtd])).toEqual([['Fulano', 300, 3], ['Beltrano', 300, 1]]);
    expect(a.top5Pct).toBe(100);
    expect(a.porDiaDaSemana.map((x) => x.qtd)).toEqual([1, 0, 0, 0, 0, 3, 0]);
    expect(a.porSetor.map((s) => s.rotulo).sort()).toEqual(['Salão', 'Sem setor informado']);
    expect(a.porUnidade[0].pct).toBe(50);
  });

  it('as frases dizem o gasto, a comparação em VALOR, os recorrentes e a situação', () => {
    const texto = analisarConsolidado(consolidado(linhas)).leituras.join(' | ');
    expect(texto).toContain('4 solicitação(ões)');
    expect(texto).toContain('200% acima de outubro/2026');
    expect(texto).toContain('1 freelancer(s) recorrente(s) respondem por 50%');
    expect(texto).toContain('Sábado é o dia com mais chamadas');
    expect(texto).toContain('1 solicitação(ões) rejeitada(s)');
    expect(analisarConsolidado(consolidado([])).leituras).toHaveLength(1);
  });

  it('dia da semana começa na segunda', () => {
    expect(diaDaSemanaSegDom('2026-11-02')).toBe(0);
    expect(diaDaSemanaSegDom('2026-11-08')).toBe(6);
  });

  it('o filtro é lido de um lugar só e volta igual na query; unidade fora do alcance é ignorada', () => {
    const p = new URLSearchParams('periodo=personalizado&de=2026-11-01&ate=2026-11-15&unidade=x&tipo=TODOS&status=PAID&rec=recorrentes');
    const f = lerFiltroConsolidado(p, ['a']);
    expect(f).toEqual({ periodo: 'personalizado', de: '2026-11-01', ate: '2026-11-15', unitId: undefined, tipo: 'TODOS', status: 'PAID', recorrencia: 'recorrentes' });
    expect(lerFiltroConsolidado(new URLSearchParams('unidade=a&periodo=lixo&de=ontem'), ['a'])).toMatchObject({ unitId: 'a', periodo: 'mes', de: undefined, tipo: 'FREELANCER' });
    const q = new URLSearchParams(queryDoFiltroConsolidado(f));
    expect(lerFiltroConsolidado(q, ['a'])).toEqual(f);
  });
});

describe('exportações dos relatórios executivos', () => {
  it('baixar exige só VER, e as duas rotas passam pela guarda', () => {
    expect(regraDaRota('/api/waste/salgados/export')).toMatchObject({ modulo: 'WASTE', exigir: 'ver' });
    expect(regraDaRota('/api/payments/freelancer-report/consolidado')).toMatchObject({ exigir: 'ver' });
    for (const arq of ['src/app/api/waste/salgados/export/route.ts', 'src/app/api/payments/freelancer-report/consolidado/route.ts']) {
      expect(readFileSync(arq, 'utf8'), arq).toContain('guardaDaRota(user.role, req)');
    }
  });

  it('o Excel gerencial dos freelancers não leva CPF nem chave PIX', () => {
    const fonte = readFileSync('src/app/api/payments/freelancer-report/consolidado/route.ts', 'utf8');
    expect(fonte).not.toMatch(/\.cpf|pixKey/);
  });

  it('a tela dos freelancers oferece Excel e PDF no mesmo recorte e mostra o discriminativo', () => {
    const fonte = readFileSync('src/components/payments/consolidado-client.tsx', 'utf8');
    expect(fonte).toContain('/api/payments/freelancer-report/consolidado?${queryDoFiltroConsolidado(filtro)}');
    expect(fonte).toContain('window.print()');
    expect(fonte).toContain('data-testid="discriminativo"');
  });
});
