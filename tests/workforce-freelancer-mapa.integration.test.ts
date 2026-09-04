import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getUnitDayMap, assignFreelancerSector, snapshotUnitDay } from '@/lib/workforce';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Freelancer alocado aparece NO SETOR do mapa do dia — mesmo com o pagamento
 * pendente.
 *
 * O relato: "mesmo com status pendente já deve alocar, não é necessário
 * aguardar aprovação". A alocação até existia (o painel mostrava o setor
 * escolhido), mas a pessoa vivia numa lista paralela: a planta da unidade conta
 * o que está nas células, então o setor aparecia "0/1 · vazio" com o freelancer
 * alocado nele. A tela dizia o contrário do que estava gravado.
 */

const sfx = `wf${process.pid.toString(36)}`;
let unitId: string;
let userId: string;
let sectorId: string;
let outroSetor: string;
let freelancerId: string;
let requestId: string;

const HOJE = '2026-09-04';
const admin = (): SessionUser => ({ id: userId, name: 'Alan', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `WF-${sfx}`, name: 'U Mapa', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Alan', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  sectorId = (await prisma.sector.create({ data: { unitId, name: 'Pratos', minHeadcount: 1 } })).id;
  outroSetor = (await prisma.sector.create({ data: { unitId, name: 'Salão', minHeadcount: 1 } })).id;
  await prisma.shift.create({ data: { unitId, name: 'Entrada', startTime: '10:00', endTime: '18:00', order: 0 } });

  freelancerId = (await prisma.freelancer.create({ data: { name: `PAULINA ${sfx}`, pixKey: '31996631838', defaultValue: 72.55, units: { create: { unitId } } } })).id;
  requestId = (await prisma.paymentRequest.create({
    data: {
      unitId, type: 'FREELANCER', status: 'PENDING', amount: 72.55,
      description: 'Freelancer do dia', requestedById: userId, approverRole: 'MANAGER',
      freelancerId, workDate: new Date(Date.UTC(2026, 8, 4)), workStartTime: '12:00', workEndTime: '14:10',
    },
  })).id;
});

afterAll(async () => {
  await prisma.workforceDaySnapshot.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.paymentRequest.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.freelancerUnit.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.freelancer.delete({ where: { id: freelancerId } }).catch(() => {});
  await prisma.shift.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.sector.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Sem alocar em setor nenhum', () => {
  it('o setor continua vazio — o freelancer existe mas não está em lugar nenhum', async () => {
    const m = await getUnitDayMap(unitId, HOJE, null);
    expect(m.cells[sectorId]['Entrada 10:00-18:00']).toEqual([]);
    expect(m.coverage[sectorId]['Entrada 10:00-18:00']).toBe('none');
  });
});

describe('Alocando o freelancer PENDENTE em Pratos', () => {
  it('a alocação é aceita sem depender de aprovação', async () => {
    const r = await assignFreelancerSector(admin(), requestId, sectorId);
    expect(r.ok).toBe(true);
    const req = await prisma.paymentRequest.findUnique({ where: { id: requestId }, select: { status: true, workSectorId: true } });
    /* O pagamento SEGUE pendente: aprovar dinheiro e alocar gente são decisões
       diferentes, tomadas por pessoas diferentes, em momentos diferentes. */
    expect(req?.status).toBe('PENDING');
    expect(req?.workSectorId).toBe(sectorId);
  });

  it('ele aparece DENTRO do setor no mapa, e o setor deixa de estar vazio', async () => {
    const m = await getUnitDayMap(unitId, HOJE, null);
    const gente = m.cells[sectorId]['Entrada 10:00-18:00'];
    expect(gente).toHaveLength(1);
    expect(gente[0].name).toContain('PAULINA');
    expect(gente[0].kind).toBe('FREELANCER');
    expect(gente[0].pendente).toBe(true);
    expect(gente[0].horario).toBe('12:00-14:10');
    /* É isto que a planta lê: sem entrar na célula, o card dizia "0/1 · vazio". */
    expect(m.coverage[sectorId]['Entrada 10:00-18:00']).toBe('ok');
  });

  it('e não vaza para outro setor', async () => {
    const m = await getUnitDayMap(unitId, HOJE, null);
    expect(m.cells[outroSetor]['Entrada 10:00-18:00']).toEqual([]);
    expect(m.coverage[outroSetor]['Entrada 10:00-18:00']).toBe('none');
  });
});

describe('Depois de aprovado, nada muda no mapa', () => {
  it('continua no mesmo setor, agora sem a marca de pendente', async () => {
    await prisma.paymentRequest.update({ where: { id: requestId }, data: { status: 'APPROVED' } });
    const m = await getUnitDayMap(unitId, HOJE, null);
    const gente = m.cells[sectorId]['Entrada 10:00-18:00'];
    expect(gente).toHaveLength(1);
    expect(gente[0].pendente).toBe(false);
  });
});

describe('O histórico do dia não duplica a pessoa', () => {
  it('o freelancer entra uma vez só, marcado como freelancer', async () => {
    /* Ele agora vem dentro da célula; se o congelamento também o acrescentasse
       pela lista paralela, o dia teria a mesma pessoa duas vezes. */
    await snapshotUnitDay(unitId, HOJE);
    const linhas = await prisma.workforceDaySnapshot.findMany({ where: { unitId, date: HOJE } });
    const dela = linhas.filter((l) => l.personName.includes('PAULINA'));
    expect(dela).toHaveLength(1);
    expect(dela[0].kind).toBe('FREELANCER');
    expect(dela[0].sectorName).toBe('Pratos');
  });
});
