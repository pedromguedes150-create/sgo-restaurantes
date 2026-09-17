import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getConsolidadoFreelancers, resolverPeriodo, periodoAnterior } from '@/lib/payments/consolidado';
import { getFreelancerWeekLimit } from '@/lib/payments/recorrencia';
import type { FiltroConsolidado } from '@/lib/payments/consolidado-tipos';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O consolidado responde três perguntas de gestão: quais unidades mais usam
 * freelancer, quanto custa e onde o MESMO freelancer aparece semana após
 * semana. A terceira é a que justifica a tela — e ela não pode ter uma regra
 * própria: tem de ser a mesma que já avisa o supervisor no lançamento.
 *
 * As datas são todas fixas e injetadas (`hoje`), senão o teste passaria ou
 * quebraria conforme o dia da semana em que rodasse.
 */

const sfx = process.pid.toString(36);

/* Segunda-feira, de propósito: a semana da regra é segunda→domingo. */
const SEGUNDA = '2026-06-01';
const HOJE = new Date('2026-06-03T12:00:00Z'); // quarta da mesma semana

let adminId: string;
let supervisorId: string;
let unitA: string;
let unitB: string;
let unitFora: string;
let joao: string;
let maria: string;
let limite: number;

const rede = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const soUnidadeA = (): SessionUser => ({ id: supervisorId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false });

const filtro = (over: Partial<FiltroConsolidado> = {}): FiltroConsolidado => ({
  periodo: 'personalizado', de: '2026-06-01', ate: '2026-06-30',
  tipo: 'FREELANCER', status: 'TODOS', recorrencia: 'todos', ...over,
});

/** Uma solicitação de freelancer no dia informado. */
async function pedir(opts: { unitId: string; freelancerId?: string; dia: string; valor?: number; status?: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED'; tipo?: 'FREELANCER' | 'OVERTIME' }) {
  return prisma.paymentRequest.create({
    data: {
      type: opts.tipo ?? 'FREELANCER',
      unitId: opts.unitId,
      status: opts.status ?? 'APPROVED',
      amount: opts.valor ?? 100,
      freelancerId: opts.freelancerId ?? null,
      workDate: new Date(`${opts.dia}T00:00:00Z`),
      description: `teste ${sfx}`,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: `Adm ${sfx}`, email: `cons-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supervisorId = (await prisma.user.create({ data: { name: `Sup ${sfx}`, email: `cons2-${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  unitA = (await prisma.unit.create({ data: { code: `CONA-${sfx}`, name: 'Unidade A', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `CONB-${sfx}`, name: 'Unidade B', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitFora = (await prisma.unit.create({ data: { code: `CONF-${sfx}`, name: 'Unidade Fora', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  joao = (await prisma.freelancer.create({ data: { name: `João ${sfx}`, defaultValue: 100 } })).id;
  maria = (await prisma.freelancer.create({ data: { name: `Maria ${sfx}`, defaultValue: 95 } })).id;
  limite = await getFreelancerWeekLimit();
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB, unitFora] } } });
  await prisma.freelancer.deleteMany({ where: { id: { in: [joao, maria] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB, unitFora] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supervisorId] } } });
});

const limpar = () => prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB, unitFora] } } });

describe('os períodos do filtro', () => {
  it('esta semana é segunda→domingo, o mesmo corte da regra de recorrência', () => {
    const p = resolverPeriodo({ periodo: 'semana' }, HOJE);
    expect(p.de).toBe('2026-06-01');
    expect(p.ate).toBe('2026-06-07');
  });

  it('semana anterior recua sete dias', () => {
    const p = resolverPeriodo({ periodo: 'semana-anterior' }, HOJE);
    expect([p.de, p.ate]).toEqual(['2026-05-25', '2026-05-31']);
  });

  it('este mês vai do dia 1 ao último dia', () => {
    const p = resolverPeriodo({ periodo: 'mes' }, HOJE);
    expect([p.de, p.ate]).toEqual(['2026-06-01', '2026-06-30']);
  });

  it('mês anterior idem, respeitando meses curtos', () => {
    const p = resolverPeriodo({ periodo: 'mes-anterior' }, new Date('2026-03-15T12:00:00Z'));
    expect([p.de, p.ate]).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('personalizado com datas trocadas se endireita em vez de dar período vazio', () => {
    const p = resolverPeriodo({ periodo: 'personalizado', de: '2026-06-20', ate: '2026-06-10' }, HOJE);
    expect([p.de, p.ate]).toEqual(['2026-06-10', '2026-06-20']);
  });

  it('personalizado sem datas cai no mês, não em silêncio', () => {
    const p = resolverPeriodo({ periodo: 'personalizado' }, HOJE);
    expect([p.de, p.ate]).toEqual(['2026-06-01', '2026-06-30']);
  });
});

describe('a base de comparação', () => {
  it('mês compara com o MÊS calendário anterior, não com 30 dias atrás', () => {
    /* Trinta dias para trás de 1º de março cai no meio de fevereiro e a
       comparação passaria a medir pedaços de dois meses. */
    const p = resolverPeriodo({ periodo: 'mes' }, new Date('2026-03-15T12:00:00Z'));
    const a = periodoAnterior(p, { periodo: 'mes' });
    expect([a.de, a.ate]).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('semana compara com a semana anterior', () => {
    const p = resolverPeriodo({ periodo: 'semana' }, HOJE);
    const a = periodoAnterior(p, { periodo: 'semana' });
    expect([a.de, a.ate]).toEqual(['2026-05-25', '2026-05-31']);
  });

  it('personalizado compara com o mesmo número de dias, imediatamente antes', () => {
    const p = { de: '2026-06-10', ate: '2026-06-19', rotulo: '', tipo: 'livre' as const };
    const a = periodoAnterior(p, { periodo: 'personalizado' });
    expect([a.de, a.ate]).toEqual(['2026-05-31', '2026-06-09']);
  });
});

describe('a recorrência é A REGRA QUE JÁ EXISTE', () => {
  it('passar do limite semanal marca o freelancer', async () => {
    await limpar();
    for (let i = 0; i <= limite; i++) await pedir({ unitId: unitA, freelancerId: joao, dia: `2026-06-0${i + 1}` });
    await pedir({ unitId: unitA, freelancerId: maria, dia: '2026-06-02' });

    const c = await getConsolidadoFreelancers(rede(), filtro(), HOJE);
    expect(c.limiteSemanal).toBe(limite);
    expect(c.resumo.recorrentes).toBe(1);
    expect(c.recorrentesNaSemana).toHaveLength(1);
    expect(c.recorrentesNaSemana[0].solicitacoes).toBe(limite + 1);
    expect(c.recorrentesNaSemana[0].semanaDe).toBe(SEGUNDA);
    expect(c.freelancers.find((f) => f.freelancerId === maria)?.recorrente).toBe(false);
  });

  it('exatamente no limite NÃO é recorrente', async () => {
    await limpar();
    for (let i = 0; i < limite; i++) await pedir({ unitId: unitA, freelancerId: joao, dia: `2026-06-0${i + 1}` });
    const c = await getConsolidadoFreelancers(rede(), filtro(), HOJE);
    expect(c.resumo.recorrentes).toBe(0);
    expect(c.recorrentesNaSemana).toEqual([]);
  });

  it('rejeitada não conta para a recorrência — a regra já a ignora', async () => {
    await limpar();
    for (let i = 0; i < limite; i++) await pedir({ unitId: unitA, freelancerId: joao, dia: `2026-06-0${i + 1}` });
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-05', status: 'REJECTED' });
    const c = await getConsolidadoFreelancers(rede(), filtro(), HOJE);
    expect(c.resumo.recorrentes).toBe(0);
  });

  it('a semana conta INTEIRA mesmo quando o período começa no meio dela', async () => {
    /* Um período que abre na quarta cortaria a semana ao meio e diria "2
       solicitações" onde a supervisão recebeu alerta de 3. */
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01' }); // segunda
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-02' }); // terça
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-04' }); // quinta

    const c = await getConsolidadoFreelancers(rede(), filtro({ de: '2026-06-03', ate: '2026-06-30' }), HOJE);
    expect(c.resumo.solicitacoes).toBe(1); // só a quinta está no período
    expect(c.resumo.recorrentes).toBe(1);  // mas a SEMANA tem três
    expect(c.recorrentesNaSemana[0].solicitacoes).toBe(3);
  });

  it('o freelancer é o mesmo em qualquer unidade: 2+2 em unidades diferentes é recorrente', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01' });
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-02' });
    await pedir({ unitId: unitB, freelancerId: joao, dia: '2026-06-03' });
    await pedir({ unitId: unitB, freelancerId: joao, dia: '2026-06-04' });

    /* Mesmo filtrando por UMA unidade, a contagem da semana continua sendo a
       da rede — senão o filtro esconderia justamente o que se veio ver. */
    const c = await getConsolidadoFreelancers(rede(), filtro({ unitId: unitA }), HOJE);
    expect(c.resumo.solicitacoes).toBe(2);
    expect(c.recorrentesNaSemana[0].solicitacoes).toBe(4);
    expect(c.recorrentesNaSemana[0].unidades.sort()).toEqual(['Unidade A', 'Unidade B']);
  });

  it('"somente recorrentes" filtra as linhas sem apagar o selo', async () => {
    await limpar();
    for (let i = 0; i <= limite; i++) await pedir({ unitId: unitA, freelancerId: joao, dia: `2026-06-0${i + 1}` });
    await pedir({ unitId: unitA, freelancerId: maria, dia: '2026-06-02' });

    const c = await getConsolidadoFreelancers(rede(), filtro({ recorrencia: 'recorrentes' }), HOJE);
    expect(c.freelancers).toHaveLength(1);
    expect(c.freelancers[0].freelancerId).toBe(joao);
    expect(c.resumo.solicitacoes).toBe(limite + 1);
  });
});

describe('os números do consolidado', () => {
  it('rejeitada fica no histórico, FORA do valor solicitado', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01', valor: 200, status: 'PAID' });
    await pedir({ unitId: unitA, freelancerId: maria, dia: '2026-06-02', valor: 500, status: 'REJECTED' });

    const c = await getConsolidadoFreelancers(rede(), filtro(), HOJE);
    expect(c.resumo.solicitacoes).toBe(2);
    expect(c.resumo.valorSolicitado).toBe(200);
    expect(c.resumo.valorAprovadoPago).toBe(200);
    expect(c.resumo.rejeitadasCount).toBe(1);
    expect(c.resumo.rejeitadasValor).toBe(500);
  });

  it('não duplica: cada solicitação conta uma vez, em uma unidade só', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01', valor: 100 });
    await pedir({ unitId: unitB, freelancerId: joao, dia: '2026-06-02', valor: 300 });

    const c = await getConsolidadoFreelancers(rede(), filtro(), HOJE);
    expect(c.resumo.solicitacoes).toBe(2);
    expect(c.resumo.freelancersUnicos).toBe(1);
    expect(c.porUnidade.reduce((s, u) => s + u.solicitacoes, 0)).toBe(2);
    expect(Math.round(c.porUnidade.reduce((s, u) => s + u.pctRede, 0))).toBe(100);
    expect(c.porUnidade[0].nome).toBe('Unidade B'); // maior valor primeiro
  });

  it('a comparação mede o mesmo período deslocado', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-05-04' });
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-05-05' });
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01' });
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-02' });
    await pedir({ unitId: unitA, freelancerId: maria, dia: '2026-06-03' });

    const c = await getConsolidadoFreelancers(rede(), filtro({ periodo: 'mes' }), HOJE);
    expect(c.resumo.solicitacoes).toBe(3);
    expect(c.comparacao.solicitacoesAntes).toBe(2);
    expect(Math.round(c.comparacao.variacaoPct!)).toBe(50);
  });

  it('sem base anterior não inventa percentual', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01' });
    const c = await getConsolidadoFreelancers(rede(), filtro({ periodo: 'mes' }), HOJE);
    expect(c.comparacao.solicitacoesAntes).toBe(0);
    expect(c.comparacao.variacaoPct).toBeNull();
  });

  it('o tipo separa Freelancer de Hora Extra', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01' });
    await pedir({ unitId: unitA, dia: '2026-06-02', tipo: 'OVERTIME' });

    expect((await getConsolidadoFreelancers(rede(), filtro({ tipo: 'FREELANCER' }), HOJE)).resumo.solicitacoes).toBe(1);
    expect((await getConsolidadoFreelancers(rede(), filtro({ tipo: 'OVERTIME' }), HOJE)).resumo.solicitacoes).toBe(1);
    expect((await getConsolidadoFreelancers(rede(), filtro({ tipo: 'TODOS' }), HOJE)).resumo.solicitacoes).toBe(2);
  });

  it('o status filtra sem mexer na conta da semana', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01', status: 'PENDING' });
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-02', status: 'PAID' });
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-03', status: 'PAID' });

    const c = await getConsolidadoFreelancers(rede(), filtro({ status: 'PAID' }), HOJE);
    expect(c.resumo.solicitacoes).toBe(2);
    /* A recorrência olha as três: filtrar a TELA não pode mudar a regra. */
    expect(c.recorrentesNaSemana[0].solicitacoes).toBe(3);
  });

  it('a evolução vira semanas no mês e meses em períodos longos', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01' });
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-15' });

    expect((await getConsolidadoFreelancers(rede(), filtro({ periodo: 'mes' }), HOJE)).evolucao.granularidade).toBe('semana');
    expect((await getConsolidadoFreelancers(rede(), filtro({ de: '2026-01-01', ate: '2026-06-30' }), HOJE)).evolucao.granularidade).toBe('mes');
  });
});

describe('o escopo por unidade vale no servidor', () => {
  it('quem só enxerga uma unidade não vê os lançamentos das outras', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01', valor: 100 });
    await pedir({ unitId: unitFora, freelancerId: maria, dia: '2026-06-02', valor: 900 });

    const c = await getConsolidadoFreelancers(soUnidadeA(), filtro(), HOJE);
    expect(c.resumo.solicitacoes).toBe(1);
    expect(c.resumo.valorSolicitado).toBe(100);
    expect(c.porUnidade.map((u) => u.nome)).toEqual(['Unidade A']);
  });

  it('a recorrência também respeita o escopo — não vaza contagem de unidade alheia', async () => {
    await limpar();
    await pedir({ unitId: unitA, freelancerId: joao, dia: '2026-06-01' });
    for (let i = 0; i <= limite; i++) await pedir({ unitId: unitFora, freelancerId: joao, dia: `2026-06-0${i + 2}` });

    const dele = await getConsolidadoFreelancers(soUnidadeA(), filtro(), HOJE);
    expect(dele.recorrentesNaSemana).toEqual([]);

    const daRede = await getConsolidadoFreelancers(rede(), filtro(), HOJE);
    expect(daRede.recorrentesNaSemana[0].solicitacoes).toBe(limite + 2);
  });
});
