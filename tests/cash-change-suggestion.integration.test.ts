import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { suggestChangeRequest, countVault, refillBucket, upsertBucket, requestChange } from '@/lib/cash-vault';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Sugestão do pedido de troco (etapa 3).
 *
 * A regra que estes testes protegem: a sugestão tem de FECHAR 1:1. Se os dois
 * lados não baterem por um centavo de arredondamento, o próprio formulário
 * recusa o pedido — e uma sugestão que o sistema rejeita é pior que nenhuma.
 */

const sfx = `sug${process.pid.toString(36)}`;
let unitId: string;
let userId: string;
const user = (): SessionUser => ({ id: userId, name: 'Ger', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `SUG-${sfx}`, name: 'Unidade Sugestão', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  const u = await prisma.user.create({ data: { name: 'Ger', email: `${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } });
  userId = u.id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
});

afterAll(async () => {
  await prisma.cashChangeRequest.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.cashVaultMovement.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.cashBucket.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.cashVault.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const soma = (b: Record<string, number>) => Object.values(b).reduce((t, v) => t + (v || 0), 0);

describe('Sugestão do pedido de troco', () => {
  it('sem baldes com meta, não sugere e explica', async () => {
    const r = await suggestChangeRequest(user(), unitId);
    expect(r?.vazia).toBe(true);
    expect(r?.motivo).toMatch(/valor-alvo/i);
  });

  it('com miúdos suficientes, não sugere e explica', async () => {
    await upsertBucket(user(), { unitId, name: 'Caixa 1', targetValue: 300 });
    // cofre só com miúdos, acima da meta
    await countVault(user(), unitId, { '10': 200, '5': 100, '1': 50 }, 'contagem inicial');
    const r = await suggestChangeRequest(user(), unitId);
    expect(r?.vazia).toBe(true);
    expect(r?.motivo).toMatch(/não falta troco/i);
  });

  it('faltando miúdos e com notas grandes, sugere uma troca que FECHA 1:1', async () => {
    // meta 300; cofre com 100 em miúdos e 400 em notas grandes → faltam 200
    await countVault(user(), unitId, { '100': 400, '10': 100 }, 'muita nota grande');
    const r = await suggestChangeRequest(user(), unitId);
    expect(r?.vazia).toBe(false);
    expect(soma(r!.need)).toBeCloseTo(soma(r!.give), 2);
    expect(r!.total).toBeGreaterThan(0);
    expect(soma(r!.give)).toBeCloseTo(r!.total, 2);
  });

  it('não entrega nota grande que o cofre não tem', async () => {
    const r = await suggestChangeRequest(user(), unitId);
    const vault = await prisma.cashVault.findUnique({ where: { unitId } });
    const saldo = vault!.balances as Record<string, number>;
    for (const [k, v] of Object.entries(r!.give)) {
      if (v > 0) expect(v).toBeLessThanOrEqual(Number(saldo[k] ?? 0) + 0.011);
    }
  });

  it('a sugestão é ACEITA pelo próprio formulário (a prova que importa)', async () => {
    const r = await suggestChangeRequest(user(), unitId);
    expect(r?.vazia).toBe(false);
    const envio = await requestChange(user(), unitId, { need: r!.need, give: r!.give, note: 'sugerido pelo sistema' });
    expect(envio.ok).toBe(true);
  });

  it('sem notas grandes, não sugere e explica', async () => {
    await countVault(user(), unitId, { '1': 20 }, 'cofre vazio de notas grandes');
    const r = await suggestChangeRequest(user(), unitId);
    expect(r?.vazia).toBe(true);
    expect(r?.motivo).toMatch(/notas grandes/i);
  });

  it('usa a composição das reposições da própria unidade', async () => {
    /* Reposição registrada só com moedas de 0,50: a sugestão seguinte deve
       privilegiar 0,50, e não espalhar por todas as denominações. */
    await countVault(user(), unitId, { '100': 500, '0.50': 100 }, 'preparando');
    await upsertBucket(user(), { unitId, name: 'Caixa 2', targetValue: 400 });
    await refillBucket(user(), unitId, (await prisma.cashBucket.findFirst({ where: { unitId, name: 'Caixa 2' } }))!.id, { '0.50': 50 }, { '100': 50 }, 'reposição só de moedas');
    const r = await suggestChangeRequest(user(), unitId);
    if (!r?.vazia) {
      const totalNeed = soma(r!.need);
      expect(r!.need['0.50']).toBeGreaterThan(totalNeed * 0.5);
    }
  });
});
