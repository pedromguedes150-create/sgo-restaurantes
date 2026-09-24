import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  agregarSalgados, saveSnackDay, getSnackDay, getConsolidadoSalgados,
  createSnackOption, toggleSnackOption, type DescarteCru,
} from '@/lib/waste/salgados';
import type { SessionUser } from '@/lib/auth/session';

/**
 * SOBRAS SALGADOS — a frente em UNIDADES.
 *
 * O que estes casos travam:
 *  - a agregação PURA (por unidade e na rede: total, tipos que mais perdem,
 *    motivo mais recorrente) — sem banco;
 *  - gravar o dia SUBSTITUI o dia (não acumula ao regravar) e soma linhas
 *    repetidas do mesmo (tipo, motivo);
 *  - opção inativa/errada é recusada; escopo por unidade no servidor;
 *  - o catálogo: só Admin/CEO mexe, e a opção usada não some, desativa.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitA: string;
let unitB: string;
let adminId: string;
let gerenteId: string;
let coxinha: string;
let kibe: string;
let vencido: string;
let sobra: string;

const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerenteA = (): SessionUser => ({ id: gerenteId, name: 'Gerente A', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });

const hoje = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `SA-${sfx}`, name: 'Salg A', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `SB-${sfx}`, name: 'Salg B', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin Salg', email: `salg-a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente Salg', email: `salg-g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: gerenteId, unitId: unitA } });
  /* Opções PRÓPRIAS do teste (nomes com sufixo) para não depender do catálogo do banco. */
  coxinha = (await prisma.wasteSnackOption.create({ data: { kind: 'TIPO', name: `Coxinha ${sfx}` } })).id;
  kibe = (await prisma.wasteSnackOption.create({ data: { kind: 'TIPO', name: `Kibe ${sfx}` } })).id;
  vencido = (await prisma.wasteSnackOption.create({ data: { kind: 'MOTIVO', name: `Vencido ${sfx}` } })).id;
  sobra = (await prisma.wasteSnackOption.create({ data: { kind: 'MOTIVO', name: `Sobra ${sfx}` } })).id;
});

beforeEach(async () => {
  await prisma.wasteSnackDiscard.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
});

afterAll(async () => {
  await prisma.wasteSnackDiscard.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.wasteSnackOption.deleteMany({ where: { name: { endsWith: sfx } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, gerenteId] } } });
  await prisma.$disconnect();
});

describe('agregarSalgados (puro)', () => {
  const cru = (over: Partial<DescarteCru>): DescarteCru => ({ unitId: 'a', unitName: 'A', operationalDate: '2026-09-01', typeName: 'Coxinha', reasonName: 'Sobra', quantity: 1, ...over });

  it('soma por unidade e na rede; rankeia tipos e motivos', () => {
    const r = agregarSalgados([
      cru({ typeName: 'Coxinha', reasonName: 'Sobra', quantity: 10 }),
      cru({ typeName: 'Kibe', reasonName: 'Vencido', quantity: 4, operationalDate: '2026-09-02' }),
      cru({ typeName: 'Coxinha', reasonName: 'Vencido', quantity: 7, operationalDate: '2026-09-02' }),
      cru({ unitId: 'b', unitName: 'B', typeName: 'Pastel', reasonName: 'Queimado', quantity: 3 }),
    ], [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
    const a = r.linhas.find((l) => l.unitId === 'a')!;
    expect(a.total).toBe(21);
    expect(a.diasComLancamento).toBe(2);
    expect(a.topTipos[0]).toEqual({ name: 'Coxinha', qty: 17 });
    // Vencido = 4 + 7 = 11 > Sobra = 10 (sem empate: o desempate seria alfabético)
    expect(a.motivoTop).toEqual({ name: 'Vencido', qty: 11 });
    expect(r.rede.total).toBe(24);
    expect(r.rede.topTipos[0].name).toBe('Coxinha');
    expect(r.rede.topMotivos[0].name).toBe('Vencido');
  });

  it('unidade sem lançamento aparece com ZERO — ausência de dado fica visível', () => {
    const r = agregarSalgados([], [{ id: 'a', name: 'A' }]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ total: 0, diasComLancamento: 0, topTipos: [], motivoTop: null });
    expect(r.rede.total).toBe(0);
  });

  it('ordena as unidades da que mais descarta para a que menos', () => {
    const r = agregarSalgados([
      cru({ unitId: 'a', unitName: 'A', quantity: 2 }),
      cru({ unitId: 'b', unitName: 'B', quantity: 9 }),
    ], [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    expect(r.linhas.map((l) => l.unitId)).toEqual(['b', 'a']);
  });
});

describe('saveSnackDay', () => {
  it('grava o dia com nomes congelados e devolve o total', async () => {
    const r = await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [
      { typeId: coxinha, reasonId: sobra, quantity: 5 },
      { typeId: kibe, reasonId: vencido, quantity: 2 },
    ] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.total).toBe(7);
    const dia = await getSnackDay(unitA, hoje());
    expect(dia.total).toBe(7);
    expect(dia.rows.map((x) => x.typeName).sort()).toEqual([`Coxinha ${sfx}`, `Kibe ${sfx}`].sort());
  });

  it('regravar o dia SUBSTITUI — não acumula', async () => {
    await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [{ typeId: coxinha, reasonId: sobra, quantity: 5 }] });
    await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [{ typeId: kibe, reasonId: vencido, quantity: 3 }] });
    const dia = await getSnackDay(unitA, hoje());
    expect(dia.total).toBe(3);
    expect(dia.rows).toHaveLength(1);
    expect(dia.rows[0].typeName).toBe(`Kibe ${sfx}`);
  });

  it('linhas repetidas do mesmo (tipo, motivo) são SOMADAS numa só', async () => {
    const r = await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [
      { typeId: coxinha, reasonId: sobra, quantity: 4 },
      { typeId: coxinha, reasonId: sobra, quantity: 6 },
    ] });
    expect(r.ok).toBe(true);
    const dia = await getSnackDay(unitA, hoje());
    expect(dia.rows).toHaveLength(1);
    expect(dia.rows[0].quantity).toBe(10);
  });

  it('lista vazia apaga o dia (dia sem descarte = sem linhas)', async () => {
    await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [{ typeId: coxinha, reasonId: sobra, quantity: 5 }] });
    const r = await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [] });
    expect(r.ok).toBe(true);
    expect((await getSnackDay(unitA, hoje())).total).toBe(0);
  });

  it('recusa opção inativa, motivo no lugar de tipo e quantidade inválida', async () => {
    const inativo = await prisma.wasteSnackOption.create({ data: { kind: 'TIPO', name: `Inativo ${sfx}`, active: false } });
    const r1 = await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [{ typeId: inativo.id, reasonId: sobra, quantity: 1 }] });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe('OPCAO_INVALIDA');
    // motivo passado como tipo
    const r2 = await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [{ typeId: sobra, reasonId: vencido, quantity: 1 }] });
    expect(r2.ok).toBe(false);
    // quantidade 0 é descartada silenciosamente → dia fica vazio, mas ok
    const r3 = await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: hoje(), rows: [{ typeId: coxinha, reasonId: sobra, quantity: 0 }] });
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.total).toBe(0);
  });

  it('gerente não lança em unidade fora do seu escopo; data futura é recusada', async () => {
    const fora = await saveSnackDay(gerenteA(), { unitId: unitB, operationalDate: hoje(), rows: [{ typeId: coxinha, reasonId: sobra, quantity: 1 }] });
    expect(fora.ok).toBe(false);
    if (!fora.ok) expect(fora.reason).toBe('FORBIDDEN');
    const amanha = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const futuro = await saveSnackDay(gerenteA(), { unitId: unitA, operationalDate: amanha, rows: [{ typeId: coxinha, reasonId: sobra, quantity: 1 }] });
    expect(futuro.ok).toBe(false);
  });
});

describe('getConsolidadoSalgados', () => {
  it('consolida o mês por unidade, com tipo e motivo mais recorrentes, e a evolução', async () => {
    const d = hoje();
    const [y, m] = d.split('-').map(Number);
    await saveSnackDay(admin(), { unitId: unitA, operationalDate: d, rows: [
      { typeId: coxinha, reasonId: sobra, quantity: 8 },
      { typeId: kibe, reasonId: vencido, quantity: 2 },
    ] });
    await saveSnackDay(admin(), { unitId: unitB, operationalDate: d, rows: [{ typeId: kibe, reasonId: vencido, quantity: 5 }] });
    const c = await getConsolidadoSalgados(admin(), y, m);
    const a = c.linhas.find((l) => l.unitId === unitA)!;
    const b = c.linhas.find((l) => l.unitId === unitB)!;
    expect(a.total).toBe(10);
    expect(a.topTipos[0].name).toBe(`Coxinha ${sfx}`);
    expect(a.motivoTop?.name).toBe(`Sobra ${sfx}`);
    expect(b.total).toBe(5);
    // a rede soma as duas unidades do teste (o banco pode ter outras — checa >= )
    expect(c.rede.total).toBeGreaterThanOrEqual(15);
    expect(c.evolucao).toHaveLength(6);
    expect(c.evolucao[5].ym).toBe(`${y}-${String(m).padStart(2, '0')}`);
  });
});

describe('catálogo de opções', () => {
  it('só Admin/CEO cria; nome duplicado é recusado; desativar preserva o histórico', async () => {
    const negado = await createSnackOption(gerenteA(), 'TIPO', `Pastel ${sfx}`);
    expect(negado.ok).toBe(false);
    if (!negado.ok) expect(negado.reason).toBe('FORBIDDEN');

    const ok = await createSnackOption(admin(), 'TIPO', `Pastel ${sfx}`);
    expect(ok.ok).toBe(true);
    const dup = await createSnackOption(admin(), 'TIPO', `pastel ${sfx}`); // caixa diferente = mesmo nome
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toBe('DUPLICADO');

    // usa a opção num lançamento e depois desativa: a linha continua lá, com o nome congelado
    await saveSnackDay(admin(), { unitId: unitA, operationalDate: hoje(), rows: [{ typeId: coxinha, reasonId: sobra, quantity: 3 }] });
    const t = await toggleSnackOption(admin(), coxinha, false);
    expect(t.ok).toBe(true);
    const dia = await getSnackDay(unitA, hoje());
    expect(dia.rows[0].typeName).toBe(`Coxinha ${sfx}`);
    await toggleSnackOption(admin(), coxinha, true);
  });
});
