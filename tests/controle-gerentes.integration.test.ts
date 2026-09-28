import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { gerentesPorUnidade, hojeNaOperacao, unidadesDoControle } from '@/lib/controle-gerentes-dados';
import type { SessionUser } from '@/lib/auth/session';

/**
 * CONTROLE DE GERENTES — a leitura por unidade.
 *
 * A regra do pedido é que cada unidade tem a sua gestão: um gerente de A nunca
 * aparece na lista de B. Quem é gerente das duas aparece nas duas — mas cada
 * lista sai do vínculo com AQUELA unidade.
 */

const sfx = `ctg${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitA: string, unitB: string;
let ana: string, bruno: string, duas: string, sup: string, inativo: string;

beforeAll(async () => {
  const u = async (code: string, name: string) => (await prisma.unit.create({ data: { code, name, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitA = await u(`CTG-A-${sfx}`, `Jardim ${sfx}`);
  unitB = await u(`CTG-B-${sfx}`, `KM13 ${sfx}`);
  const user = async (name: string, role: 'MANAGER' | 'COORDINATOR' | 'SUPERVISOR', unitIds: string[], active = true) => {
    const id = (await prisma.user.create({ data: { name: `${name} ${sfx}`, email: `${name}.${sfx}@e.com`, role, passwordHash: 'x', active } })).id;
    for (const unitId of unitIds) await prisma.unitMembership.create({ data: { userId: id, unitId } });
    return id;
  };
  ana = await user('Ana', 'MANAGER', [unitA]);
  bruno = await user('Bruno', 'COORDINATOR', [unitB]);
  duas = await user('Duda', 'MANAGER', [unitA, unitB]);
  sup = await user('Sup', 'SUPERVISOR', [unitA]);           // supervisor não é gerente da unidade
  inativo = await user('Inativo', 'MANAGER', [unitA], false); // desligado não conta
  await prisma.managerWorkSchedule.create({ data: { userId: ana, weekdays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '16:00' } });
  await prisma.managerLeave.createMany({
    data: [
      { userId: ana, kind: 'FOLGA', startDate: '2026-09-29', endDate: '2026-09-29' },
      { userId: ana, kind: 'FOLGA', startDate: '2026-08-10', endDate: '2026-08-10' }, // fora do intervalo pedido
      { userId: bruno, kind: 'FERIAS', startDate: '2026-09-20', endDate: '2026-10-05' },
    ],
  });
});

afterAll(async () => {
  const ids = [ana, bruno, duas, sup, inativo];
  await prisma.managerLeave.deleteMany({ where: { userId: { in: ids } } });
  await prisma.managerWorkSchedule.deleteMany({ where: { userId: { in: ids } } });
  await prisma.unitMembership.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.$disconnect();
});

describe('gerentes por unidade', () => {
  it('cada unidade só com os seus gerentes; quem é das duas aparece nas duas', async () => {
    const m = await gerentesPorUnidade([unitA, unitB], '2026-09-01', '2026-10-31');
    const nomes = (id: string) => (m.get(id) ?? []).map((g) => g.name.replace(` ${sfx}`, '')).sort();
    expect(nomes(unitA)).toEqual(['Ana', 'Duda']);   // sem supervisor, sem inativo, sem Bruno
    expect(nomes(unitB)).toEqual(['Bruno', 'Duda']); // coordenador conta como gestão da unidade
  });

  it('só as ausências que tocam o intervalo, e o horário vem junto', async () => {
    const m = await gerentesPorUnidade([unitA], '2026-09-01', '2026-10-31');
    const a = m.get(unitA)!.find((g) => g.userId === ana)!;
    expect(a.ausencias.map((x) => x.startDate)).toEqual(['2026-09-29']); // a de agosto ficou de fora
    expect(a.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(a.startTime).toBe('08:00');
  });

  it('pedir uma unidade não traz gerente de outra', async () => {
    const m = await gerentesPorUnidade([unitB], '2026-09-01', '2026-10-31');
    expect([...m.keys()]).toEqual([unitB]);
    expect(m.get(unitB)!.some((g) => g.userId === ana)).toBe(false);
  });
});

describe('escopo e hoje', () => {
  it('as unidades do controle obedecem o escopo do usuário', async () => {
    const soA: SessionUser = { id: sup, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false };
    const ids = (await unidadesDoControle(soA)).map((u) => u.id);
    expect(ids).toContain(unitA);
    expect(ids).not.toContain(unitB);
  });

  it('"hoje" é o dia em Brasília, não em UTC', () => {
    // 28/09 às 23h30 em Brasília = 29/09 02h30 UTC
    expect(hojeNaOperacao(new Date('2026-09-29T02:30:00Z'))).toBe('2026-09-28');
  });
});
