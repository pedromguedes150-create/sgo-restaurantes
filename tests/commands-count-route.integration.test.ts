import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A ROTA da contagem em grade — não a função.
 *
 * Por que existe: os testes de comandas chamavam `submitCount` direto. Quando a
 * grade passou a mandar o que está MARCADO (e o servidor a calcular o ausente),
 * a função ganhou `presentNumbers`/`inUseNumbers`/`scopeNumbers` — e a rota
 * continuou repassando só `absentNumbers`. Os campos morriam no caminho: a tela
 * mandava tudo certo, o servidor recebia uma grade vazia, gravava "0 faltando",
 * não abria divergência nenhuma e ainda salvava a grade em branco para o dia
 * seguinte. Tudo verde, e a conferência da madrugada não valia nada.
 *
 * Teste de função não pega isso. Este pega.
 */

const sfx = `rt${process.pid.toString(36)}`;
let unitId: string;
let mgrId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'M', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionUser: async () => mgr(),
}));

/** Chama o POST da rota como o navegador chamaria. */
async function postContagem(body: unknown) {
  const { POST } = await import('@/app/api/commands/count/route');
  const res = await POST(new Request('http://localhost/api/commands/count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `RT-${sfx}`, name: 'U Rota', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  await prisma.commandSequence.create({ data: { unitId, name: 'Principal', rangeStart: 1, rangeEnd: 20, order: 0 } });
  mgrId = (await prisma.user.create({ data: { name: 'M', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
});

afterAll(async () => {
  await prisma.commandDivergence.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.commandCount.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.commandSequence.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

const numeros = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);

describe('POST /api/commands/count — o que a grade manda chega inteiro', () => {
  it('o que ficou sem marcar vira falta e divergência', async () => {
    /* A grade manda as MARCADAS. Marcando 1..17, as 18, 19 e 20 faltam. */
    const r = await postContagem({
      unitId, operationalDate: '2026-07-01', allPresent: false,
      presentNumbers: numeros(1, 17), inUseNumbers: [], observation: 'ficaram no salão',
    });
    expect(r.status).toBe(200);
    expect(r.data.absent).toEqual([18, 19, 20]);

    const abertas = await prisma.commandDivergence.findMany({ where: { unitId, status: 'OPEN' }, select: { number: true } });
    expect(abertas.map((d) => d.number).sort((a, b) => a - b)).toEqual([18, 19, 20]);
  });

  it('a grade marcada é gravada — no dia seguinte ela reabre preenchida', async () => {
    const c = await prisma.commandCount.findFirst({ where: { unitId, operationalDate: '2026-07-01' } });
    expect(c!.presentNumbers).toEqual(numeros(1, 17));
    expect(c!.absentCount).toBe(3);
  });

  it('EM USO conta como presente, não como falta', async () => {
    await prisma.commandDivergence.deleteMany({ where: { unitId } });
    const r = await postContagem({
      unitId, operationalDate: '2026-07-02', allPresent: false,
      presentNumbers: numeros(1, 18), inUseNumbers: [19, 20],
    });
    expect(r.status).toBe(200);
    expect(r.data.absent).toEqual([]);
    expect(await prisma.commandDivergence.count({ where: { unitId, status: 'OPEN' } })).toBe(0);
  });

  it('contagem PARCIAL só julga o escopo dela (a madrugada do caixa)', async () => {
    /* Confere só 1..10 e marca todas. As 11..20 não foram contadas — não podem
       virar extraviadas por isso, senão o supervisor é alertado toda noite. */
    const r = await postContagem({
      unitId, operationalDate: '2026-07-03', allPresent: false,
      scopeNumbers: numeros(1, 10), presentNumbers: numeros(1, 10), inUseNumbers: [],
    });
    expect(r.status).toBe(200);
    expect(r.data.absent).toEqual([]);
    expect(await prisma.commandDivergence.count({ where: { unitId, status: 'OPEN' } })).toBe(0);
  });

  it('sem observação, a falta é recusada pelo servidor (não só pela tela)', async () => {
    const r = await postContagem({
      unitId, operationalDate: '2026-07-04', allPresent: false,
      presentNumbers: numeros(1, 19), inUseNumbers: [],
    });
    expect(r.status).toBe(422);
  });
});

describe('"Todas presentes" na faixa do dia NÃO é contagem completa', () => {
  /* O atalho mandava allPresent puro, sem escopo. Com a faixa do dia aberta,
     um toque registrava a sequência inteira como presente E zerava o indicador
     "última contagem completa" — apagando a única informação que dizia há
     quanto tempo ninguém confere o estoque guardado. */
  it('com escopo, continua sendo PARCIAL', async () => {
    const { getLastFullCount } = await import('@/lib/commands/full-count');
    await prisma.commandCount.deleteMany({ where: { unitId } });

    const r = await postContagem({
      unitId, operationalDate: '2026-07-10', allPresent: true,
      scopeNumbers: numeros(1, 10), presentNumbers: numeros(1, 10), inUseNumbers: [],
    });
    expect(r.status).toBe(200);

    const c = await prisma.commandCount.findFirst({ where: { unitId, operationalDate: '2026-07-10' } });
    expect(c!.scopeNumbers).toEqual(numeros(1, 10));
    /* Só as 10 do escopo entram como presentes — não as 20 da sequência. */
    expect(c!.presentNumbers).toEqual(numeros(1, 10));

    const completa = await getLastFullCount(unitId, '2026-07-10');
    expect(completa.never).toBe(true);
  });

  it('sem escopo (unidade que confere tudo), continua sendo COMPLETA', async () => {
    const { getLastFullCount } = await import('@/lib/commands/full-count');
    const r = await postContagem({ unitId, operationalDate: '2026-07-11', allPresent: true });
    expect(r.status).toBe(200);

    const completa = await getLastFullCount(unitId, '2026-07-11');
    expect(completa.never).toBe(false);
    expect(completa.date).toBe('2026-07-11');
  });
});
