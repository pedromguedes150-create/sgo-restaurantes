import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { submitCount } from '@/lib/commands/count';
import { getActiveSequence } from '@/lib/commands/active';
import { getScanContext, submitScanCount } from '@/lib/commands/scan';
import { getLastFullCount } from '@/lib/commands/full-count';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Contagem PARCIAL da madrugada.
 *
 * A rotina real: o caixa confere só uma faixa (ex.: 1–300) durante a madrugada,
 * e a contagem completa acontece uma vez por semana. Sem escopo, tudo que
 * ninguém se propôs a contar naquela noite viraria faltante, abriria divergência
 * e alertaria o supervisor — TODA noite. Estes testes existem para impedir isso.
 */

const sfx = `par${process.pid.toString(36)}`;
let unitId: string;
let userId: string;
const user = (): SessionUser => ({ id: userId, name: 'Caixa', role: 'CASHIER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `PAR-${sfx}`, name: 'Unidade Parcial', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  // faixa da madrugada 1–300 · faixa só da semanal 301–600
  await prisma.commandSequence.create({ data: { unitId, name: 'Salão (madrugada)', rangeStart: 1, rangeEnd: 300, order: 0, nightly: true } });
  await prisma.commandSequence.create({ data: { unitId, name: 'Reserva (semanal)', rangeStart: 301, rangeEnd: 600, order: 1, nightly: false } });
  const u = await prisma.user.create({ data: { name: 'Caixa', email: `${sfx}@example.com`, role: 'CASHIER', passwordHash: 'x' } });
  userId = u.id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
});

afterAll(async () => {
  await prisma.commandDivergence.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.commandCount.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.commandSequence.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Faixa da madrugada', () => {
  it('a sequência separa o que é da madrugada do que é só da semanal', async () => {
    const seq = await getActiveSequence(unitId);
    expect(seq.hasNightly).toBe(true);
    expect(seq.active.size).toBe(600);
    expect(seq.nightly.size).toBe(300);
    expect(seq.nightly.has(1)).toBe(true);
    expect(seq.nightly.has(300)).toBe(true);
    expect(seq.nightly.has(301)).toBe(false);
  });

  it('a tela do caixa já vem com a faixa da madrugada, marcada como parcial', async () => {
    const r = await getScanContext(user(), unitId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ctx.partial).toBe(true);
      expect(r.ctx.activeNumbers.length).toBe(300);
      expect(r.ctx.totalAtivas).toBe(600);
    }
  });
});

describe('A contagem parcial NÃO extravia o que não foi contado', () => {
  it('bipando a faixa inteira, nada fica faltando e nenhuma divergência abre', async () => {
    const todas = Array.from({ length: 300 }, (_, i) => i + 1);
    const r = await submitScanCount(user(), { unitId, scannedNumbers: todas });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absent).toEqual([]);
    expect(await prisma.commandDivergence.count({ where: { unitId } })).toBe(0);
  });

  it('as comandas de FORA da faixa não viram divergência', async () => {
    // bipa 1–299 (falta a 300, que É da faixa) e nada de 301–600
    const quase = Array.from({ length: 299 }, (_, i) => i + 1);
    const r = await submitScanCount(user(), { unitId, scannedNumbers: quase, note: 'madrugada' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absent).toEqual([300]); // só a que estava no escopo

    const divs = await prisma.commandDivergence.findMany({ where: { unitId }, select: { number: true } });
    expect(divs.map((d) => d.number).sort((a, b) => a - b)).toEqual([300]);
    // nada de 301 em diante
    expect(divs.some((d) => d.number > 300)).toBe(false);
  });

  it('a contagem guarda o escopo, para o histórico saber que foi parcial', async () => {
    const c = await prisma.commandCount.findFirst({ where: { unitId }, orderBy: { createdAt: 'desc' } });
    expect(Array.isArray(c?.scopeNumbers)).toBe(true);
    expect((c?.scopeNumbers as number[]).length).toBe(300);
    expect(c?.absentCount).toBe(1);
  });

  it('"todas presentes" numa contagem parcial vale só para a faixa', async () => {
    await prisma.commandDivergence.deleteMany({ where: { unitId } });
    const escopo = Array.from({ length: 300 }, (_, i) => i + 1);
    const r = await submitCount(user(), { unitId, operationalDate: '2026-08-10', allPresent: true, scopeNumbers: escopo });
    expect(r.ok).toBe(true);
    const c = await prisma.commandCount.findFirst({ where: { unitId, operationalDate: '2026-08-10' } });
    expect((c?.presentNumbers as number[]).length).toBe(300);
    expect(await prisma.commandDivergence.count({ where: { unitId } })).toBe(0);
  });
});

describe('A contagem COMPLETA continua julgando tudo', () => {
  it('sem escopo, o que falta em qualquer faixa vira divergência', async () => {
    await prisma.commandDivergence.deleteMany({ where: { unitId } });
    const presentes = Array.from({ length: 598 }, (_, i) => i + 1); // faltam 599 e 600
    const r = await submitCount(user(), {
      unitId, operationalDate: '2026-08-11', allPresent: false,
      presentNumbers: presentes, observation: 'contagem completa da semana',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absent.sort((a, b) => a - b)).toEqual([599, 600]);
    const c = await prisma.commandCount.findFirst({ where: { unitId, operationalDate: '2026-08-11' } });
    expect(c?.scopeNumbers).toBeNull(); // completa: sem escopo gravado
  });
});

describe('O leitor grava as bipadas (para a grade abrir com o status)', () => {
  it('conferência por leitor com faltantes grava quem foi bipada', async () => {
    await prisma.commandCount.deleteMany({ where: { unitId } });
    await prisma.commandDivergence.deleteMany({ where: { unitId } });
    const bipadas = Array.from({ length: 299 }, (_, i) => i + 1); // falta a 300
    const r = await submitScanCount(user(), { unitId, scannedNumbers: bipadas, note: 'madrugada' });
    expect(r.ok).toBe(true);

    const c = await prisma.commandCount.findFirst({ where: { unitId }, orderBy: { createdAt: 'desc' } });
    /* Antes daqui o leitor mandava só os AUSENTES: presentNumbers ficava vazio e
       a grade do gerente abria "0 ok" no dia seguinte a uma conferência inteira. */
    expect((c?.presentNumbers as number[]).length).toBe(299);
    expect((c?.presentNumbers as number[]).includes(1)).toBe(true);
    expect((c?.presentNumbers as number[]).includes(300)).toBe(false);
  });

  it('bipando tudo, grava a faixa inteira como presente', async () => {
    const todas = Array.from({ length: 300 }, (_, i) => i + 1);
    await submitScanCount(user(), { unitId, scannedNumbers: todas });
    const c = await prisma.commandCount.findFirst({ where: { unitId }, orderBy: { createdAt: 'desc' } });
    expect((c?.presentNumbers as number[]).length).toBe(300);
  });
});

describe('Indicador da última contagem completa', () => {
  it('a PARCIAL não conta como completa', async () => {
    await prisma.commandCount.deleteMany({ where: { unitId } });
    const escopo = Array.from({ length: 300 }, (_, i) => i + 1);
    await submitCount(user(), { unitId, operationalDate: '2026-08-19', allPresent: true, scopeNumbers: escopo });
    const info = await getLastFullCount(unitId, '2026-08-19');
    expect(info.never).toBe(true); // só houve parcial
  });

  it('a completa é encontrada e os dias são contados', async () => {
    await submitCount(user(), { unitId, operationalDate: '2026-08-10', allPresent: true });
    const info = await getLastFullCount(unitId, '2026-08-17');
    expect(info.never).toBe(false);
    expect(info.date).toBe('2026-08-10');
    expect(info.days).toBe(7);
    expect(info.overdue).toBe(false); // 7 dias = segunda a segunda, dentro do ritmo
  });

  it('passando do ritmo semanal, acusa atraso', async () => {
    const info = await getLastFullCount(unitId, '2026-08-20');
    expect(info.days).toBe(10);
    expect(info.overdue).toBe(true);
  });

  it('a parcial mais recente não apaga a completa anterior', async () => {
    const escopo = Array.from({ length: 300 }, (_, i) => i + 1);
    await submitCount(user(), { unitId, operationalDate: '2026-08-20', allPresent: true, scopeNumbers: escopo });
    const info = await getLastFullCount(unitId, '2026-08-20');
    expect(info.date).toBe('2026-08-10'); // segue apontando a completa
    expect(info.overdue).toBe(true);
  });
});
