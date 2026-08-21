import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createNote, updateNote, normalizeInstallments } from '@/lib/notes/create';
import { getUpcomingDues } from '@/lib/notes/due';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Boletos (parcelas) da nota recebida.
 *
 * O que estes testes protegem: a mesma nota costuma vir em 3 boletos, e antes
 * disto a nota tinha UM vencimento — o 2º e o 3º não existiam para o sistema e
 * nunca apareciam no acompanhamento que avisa a supervisão e o financeiro.
 * Vencer sem aviso é o problema real, não o campo faltando no formulário.
 */

const sfx = `prc${process.pid.toString(36)}`;
let unitId: string;
let userId: string;
const user = (): SessionUser => ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
/* Editar nota é restrito a Supervisor/Admin/CEO (regra do módulo). */
const supervisor = (): SessionUser => ({ id: userId, name: 'Sup', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });

/** ISO de hoje + N dias. */
const emDias = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `PRC-${sfx}`, name: 'Unidade Parcelas', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  userId = (await prisma.user.create({ data: { name: 'Ger', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
});

afterAll(async () => {
  await prisma.noteInstallment.deleteMany({ where: { note: { unitId } } }).catch(() => {});
  await prisma.receivedNote.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('normalizeInstallments', () => {
  it('ordena por vencimento e numera na ordem', () => {
    const r = normalizeInstallments([
      { dueDate: '2026-10-30', value: 100 },
      { dueDate: '2026-09-30', value: 100 },
      { dueDate: '2026-11-30', value: 100 },
    ]);
    expect(r.map((p) => p.seq)).toEqual([1, 2, 3]);
    expect(r[0].dueDate.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('descarta linha vazia, sem data ou sem valor', () => {
    expect(normalizeInstallments([{ dueDate: '', value: 100 }, { dueDate: '2026-09-30', value: 0 }])).toEqual([]);
    expect(normalizeInstallments(undefined)).toEqual([]);
  });
});

describe('Nota com 3 boletos', () => {
  let noteId = '';

  it('grava os três e o vencimento da NOTA vira o do primeiro', async () => {
    const r = await createNote(user(), {
      unitId, supplierName: 'Distribuidora Sul', totalValue: 3000,
      installments: [
        { dueDate: emDias(60), value: 1000 },
        { dueDate: emDias(10), value: 1000 },
        { dueDate: emDias(35), value: 1000 },
      ],
    });
    expect(r.ok).toBe(true);

    const nota = await prisma.receivedNote.findFirst({ where: { unitId }, include: { installments: { orderBy: { seq: 'asc' } } } });
    noteId = nota!.id;
    expect(nota!.installments).toHaveLength(3);
    // ordenado por vencimento, não pela ordem de digitação
    expect(nota!.installments[0].dueDate.toISOString().slice(0, 10)).toBe(emDias(10));
    expect(nota!.dueDate!.toISOString().slice(0, 10)).toBe(emDias(10));
  });

  it('CADA boleto aparece no acompanhamento de vencimentos', async () => {
    /* O ponto do recurso: antes só o primeiro existia e os outros venciam sem
       ninguém saber. */
    const rows = await getUpcomingDues(user(), { unitId, daysAhead: 90 });
    const daNota = rows.filter((x) => x.supplier === 'Distribuidora Sul');
    expect(daNota).toHaveLength(3);
    expect(daNota.map((x) => x.installment?.seq)).toEqual([1, 2, 3]);
    expect(daNota.every((x) => x.installment?.of === 3)).toBe(true);
    // cada linha traz o valor DA PARCELA, não o total da nota
    expect(daNota.every((x) => x.value === 1000)).toBe(true);
  });

  it('a nota parcelada não aparece DUAS vezes (nota + parcelas)', async () => {
    const rows = await getUpcomingDues(user(), { unitId, daysAhead: 90 });
    const semParcela = rows.filter((x) => x.supplier === 'Distribuidora Sul' && !x.installment);
    expect(semParcela).toHaveLength(0);
  });

  it('editar substitui os boletos', async () => {
    const r = await updateNote(supervisor(), noteId, {
      installments: [{ dueDate: emDias(20), value: 1500 }, { dueDate: emDias(50), value: 1500 }],
    });
    expect(r.ok).toBe(true);
    const nota = await prisma.receivedNote.findUnique({ where: { id: noteId }, include: { installments: true } });
    expect(nota!.installments).toHaveLength(2);
    expect(nota!.dueDate!.toISOString().slice(0, 10)).toBe(emDias(20));
  });

  it('editar SEM falar de boleto não apaga os boletos', async () => {
    await updateNote(supervisor(), noteId, { observation: 'só mudando a observação' });
    const nota = await prisma.receivedNote.findUnique({ where: { id: noteId }, include: { installments: true } });
    expect(nota!.installments).toHaveLength(2);
  });
});

describe('Nota de boleto único continua como sempre', () => {
  it('sem parcelas, aparece uma vez com o valor total', async () => {
    await createNote(user(), {
      unitId, supplierName: 'Fornecedor Simples', totalValue: 500, dueDate: emDias(15),
    });
    const rows = await getUpcomingDues(user(), { unitId, daysAhead: 90 });
    const dele = rows.filter((x) => x.supplier === 'Fornecedor Simples');
    expect(dele).toHaveLength(1);
    expect(dele[0].value).toBe(500);
    expect(dele[0].installment).toBeUndefined();
  });
});
