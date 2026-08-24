import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createCommandSequence, updateCommandSequence } from '@/lib/admin';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O servidor RECUSA faixas sobrepostas.
 *
 * A tela sempre disse "as faixas não devem se sobrepor" e o servidor aceitava.
 * Uma unidade acabou com "2–300" e "1–700" ao mesmo tempo: as mesmas comandas
 * em duas faixas, uma dizendo "conferida na madrugada" e a outra "só na
 * semanal". Regra que só existe como recado é regra que vai ser violada.
 */

const sfx = `sq${process.pid.toString(36)}`;
let unitId: string;
let admId: string;
const adm = (): SessionUser => ({ id: admId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `SQ-${sfx}`, name: 'U Seq', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  admId = (await prisma.user.create({ data: { name: 'A', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
});

afterAll(async () => {
  await prisma.commandSequence.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: admId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Faixas de comandas — sobreposição recusada', () => {
  let salaoId = '';
  let reservaId = '';

  it('o cadastro certo passa: 1–300 e 301–700', async () => {
    const a = await createCommandSequence(adm(), { unitId, name: 'Salão', rangeStart: 1, rangeEnd: 300 });
    const b = await createCommandSequence(adm(), { unitId, name: 'Reserva', rangeStart: 301, rangeEnd: 700 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    salaoId = (a as { id: string }).id;
    reservaId = (b as { id: string }).id;
  });

  it('criar 1–700 é recusado, dizendo qual faixa colide', async () => {
    const r = await createCommandSequence(adm(), { unitId, name: 'Tudo', rangeStart: 1, rangeEnd: 700 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('CONFLICT');
      expect(r.message).toContain('Salão');
    }
    expect(await prisma.commandSequence.count({ where: { unitId } })).toBe(2);
  });

  it('editar uma faixa para invadir a outra é recusado', async () => {
    const r = await updateCommandSequence(adm(), salaoId, { rangeStart: 1, rangeEnd: 400 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Reserva');
    const depois = await prisma.commandSequence.findUnique({ where: { id: salaoId } });
    expect(depois!.rangeEnd).toBe(300);
  });

  it('editar a própria faixa continua possível', async () => {
    /* A checagem não pode travar a correção — foi assim que se conserta o
       cadastro errado. */
    const r = await updateCommandSequence(adm(), salaoId, { rangeStart: 2, rangeEnd: 300 });
    expect(r.ok).toBe(true);
    const volta = await updateCommandSequence(adm(), salaoId, { rangeStart: 1, rangeEnd: 300 });
    expect(volta.ok).toBe(true);
  });

  it('faixa INATIVA não disputa comanda, mas reativar é checado', async () => {
    await updateCommandSequence(adm(), reservaId, { active: false });
    /* Com a Reserva dormindo, o Salão pode crescer sobre 301–700. */
    const cresce = await updateCommandSequence(adm(), salaoId, { rangeStart: 1, rangeEnd: 700 });
    expect(cresce.ok).toBe(true);

    const reativa = await updateCommandSequence(adm(), reservaId, { active: true });
    expect(reativa.ok).toBe(false);
    if (!reativa.ok) expect(reativa.message).toContain('Salão');
  });

  it('outra unidade não interfere', async () => {
    const outra = await prisma.unit.create({ data: { code: `SQ2-${sfx}`, name: 'U Seq 2', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
    const r = await createCommandSequence(adm(), { unitId: outra.id, name: 'Salão', rangeStart: 1, rangeEnd: 300 });
    expect(r.ok).toBe(true);
    await prisma.commandSequence.deleteMany({ where: { unitId: outra.id } });
    await prisma.unit.delete({ where: { id: outra.id } });
  });
});
