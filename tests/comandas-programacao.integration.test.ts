import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getActiveSequence } from '@/lib/commands/active';
import { salvarProgramacao, salvarExcecao, excluirExcecao, alternarProgramacao, listarProgramacao } from '@/lib/commands/programacao-dados';
import type { SessionUser } from '@/lib/auth/session';

/**
 * v1.201.0 — a programação manda no que a conferência julga hoje, sem tocar no
 * cadastro físico das sequências.
 */

const sfx = `pg${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let adminId: string;
let gerId: string;

const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: gerId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

/** 2026-11-09 12:00 em Brasília = segunda. */
const SEGUNDA = new Date('2026-11-09T15:00:00Z');
const DOMINGO = new Date('2026-11-15T15:00:00Z');
const dataDe = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PG-${sfx}`, name: 'U Prog', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  adminId = (await prisma.user.create({ data: { name: 'A', email: `a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  gerId = (await prisma.user.create({ data: { name: 'G', email: `g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  /* Cadastro físico: 1–10 (sem duplicidade). A madrugada marcada é 1–2. */
  await prisma.commandSequence.create({ data: { unitId, name: 'Salão', rangeStart: 1, rangeEnd: 10, nightly: false, order: 0 } });
  await prisma.commandSequence.create({ data: { unitId, name: 'Extra', rangeStart: 11, rangeEnd: 20, nightly: false, order: 1 } });
});
beforeEach(async () => {
  await prisma.commandSchedule.deleteMany({ where: { unitId } });
  await prisma.commandScheduleException.deleteMany({ where: { unitId } });
});
afterAll(async () => {
  await prisma.commandSchedule.deleteMany({ where: { unitId } });
  await prisma.commandScheduleException.deleteMany({ where: { unitId } });
  await prisma.commandSequence.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [adminId, gerId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('sem programação', () => {
  it('vale a rotina de sempre (nenhuma faixa de madrugada = confere tudo)', async () => {
    const s = await getActiveSequence(unitId, { agora: SEGUNDA });
    expect(s.programacao.origem).toBe('PADRAO');
    expect(s.hasNightly).toBe(false);
    expect(s.all.size).toBe(20);
  });
});

describe('com programação', () => {
  it('segunda = faixa 1–10; domingo = completa; o cadastro não muda', async () => {
    expect((await salvarProgramacao(admin(), { unitId, nome: 'Semana', tipo: 'FAIXA_DO_DIA', dias: [1, 2, 3, 4, 5], faixaDe: 1, faixaAte: 10 })).ok).toBe(true);
    expect((await salvarProgramacao(admin(), { unitId, nome: 'Completa', tipo: 'COMPLETA', dias: [0] })).ok).toBe(true);

    const seg = await getActiveSequence(unitId, { agora: SEGUNDA });
    expect(seg.programacao.nome).toBe('Semana');
    expect(seg.hasNightly).toBe(true);
    expect([...seg.nightly].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(seg.all.size).toBe(20); // o cadastro físico segue inteiro

    const dom = await getActiveSequence(unitId, { agora: DOMINGO });
    expect(dom.programacao.tipo).toBe('COMPLETA');
    expect(dom.hasNightly).toBe(false); // completa = confere tudo
  });

  it('sobreposição entre programações é aceita; a prioridade decide', async () => {
    await salvarProgramacao(admin(), { unitId, nome: 'Ampla', tipo: 'FAIXA_DO_DIA', dias: [1], faixaDe: 1, faixaAte: 15 });
    await salvarProgramacao(admin(), { unitId, nome: 'Estreita', tipo: 'FAIXA_DO_DIA', dias: [1], faixaDe: 1, faixaAte: 5, prioridade: 3 });
    const s = await getActiveSequence(unitId, { agora: SEGUNDA });
    expect(s.programacao.nome).toBe('Estreita');
    expect(s.programacao.concorrentes).toEqual(['Ampla']);
    expect(s.nightly.size).toBe(5);
  });

  it('exceção do dia vence a programação e pode ser removida', async () => {
    await salvarProgramacao(admin(), { unitId, nome: 'Semana', tipo: 'FAIXA_DO_DIA', dias: [1], faixaDe: 1, faixaAte: 10 });
    const ex = await salvarExcecao(admin(), { unitId, data: dataDe(SEGUNDA), nome: 'Feriado', tipo: 'COMPLETA' });
    expect(ex.ok).toBe(true);
    const s = await getActiveSequence(unitId, { agora: SEGUNDA });
    expect(s.programacao.origem).toBe('EXCECAO');
    expect(s.hasNightly).toBe(false);

    /* "sem conferência" não esvazia a conta: só avisa; vale a rotina padrão */
    await salvarExcecao(admin(), { unitId, data: dataDe(SEGUNDA), nome: 'Feriado', semConferencia: true });
    const sk = await getActiveSequence(unitId, { agora: SEGUNDA });
    expect(sk.programacao.semConferencia).toBe(true);
    expect(sk.hasNightly).toBe(false);

    const lista = await listarProgramacao(unitId);
    expect(lista.excecoes).toHaveLength(1); // salvar de novo substitui (uma por data)
    expect((await excluirExcecao(admin(), lista.excecoes[0].id)).ok).toBe(true);
    expect((await getActiveSequence(unitId, { agora: SEGUNDA })).programacao.nome).toBe('Semana');
  });

  it('pausar a programação devolve o comportamento padrão', async () => {
    const r = await salvarProgramacao(admin(), { unitId, nome: 'Semana', tipo: 'FAIXA_DO_DIA', dias: [1], faixaDe: 1, faixaAte: 10 });
    if (!r.ok) throw new Error('salvar');
    await alternarProgramacao(admin(), r.id, false);
    expect((await getActiveSequence(unitId, { agora: SEGUNDA })).programacao.origem).toBe('PADRAO');
  });

  it('faixa que não contém nenhuma comanda cadastrada é recusada', async () => {
    const r = await salvarProgramacao(admin(), { unitId, nome: 'Fantasma', tipo: 'FAIXA_DO_DIA', dias: [1], faixaDe: 500, faixaAte: 600 });
    expect(r.ok).toBe(false);
  });

  it('só Admin/CEO programa', async () => {
    const r = await salvarProgramacao(gerente(), { unitId, nome: 'X', tipo: 'COMPLETA', dias: [1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
    expect((await salvarExcecao(gerente(), { unitId, data: dataDe(SEGUNDA), nome: 'X', semConferencia: true })).ok).toBe(false);
  });
});
