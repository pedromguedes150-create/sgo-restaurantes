import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createOccurrence } from '@/lib/occurrences/create';
import { listOccurrences, GRAVIDADES_CRITICAS } from '@/lib/occurrences/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A aba GERAL CRÍTICO.
 *
 * Ela é uma **lente**, não uma caixa separada — e a diferença é o ponto inteiro
 * destes casos. "Unidade sem energia" é um problema de manutenção E é crítico;
 * se a aba tirasse a ocorrência de Manutenção, quem conserta deixaria de vê-la
 * justamente no caso mais grave.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let userId: string;
let tipoGeral: string;
let tipoManutencao: string;
let tipoTI: string;

const user = (): SessionUser => ({ id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `GC-${sfx}`, name: 'Unidade Crítico', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Gerente GC', email: `gc-${sfx}@teste.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
  tipoGeral = (await prisma.occurrenceType.create({ data: { code: `G-${sfx}`, name: 'Geral' } })).id;
  tipoManutencao = (await prisma.occurrenceType.create({ data: { code: `M-${sfx}`, name: 'Manutenção', isMaintenance: true } })).id;
  tipoTI = (await prisma.occurrenceType.create({ data: { code: `T-${sfx}`, name: 'T.I.', isIT: true } })).id;
});

beforeEach(async () => { await prisma.occurrence.deleteMany({ where: { unitId } }); });

afterAll(async () => {
  await prisma.occurrence.deleteMany({ where: { unitId } });
  await prisma.occurrenceType.deleteMany({ where: { id: { in: [tipoGeral, tipoManutencao, tipoTI] } } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unitMembership.deleteMany({ where: { userId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const criar = (typeId: string, gravity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', description: string) =>
  createOccurrence(user(), { unitId, typeId, gravity, description });

const descricoes = async (f: Parameters<typeof listOccurrences>[1]) =>
  (await listOccurrences(user(), { unitId, ...f })).items.map((o) => o.description).sort();

describe('A lente reúne por GRAVIDADE, não por assunto', () => {
  it('traz Alta e Crítica de todos os assuntos', async () => {
    await criar(tipoManutencao, 'CRITICAL', 'Unidade sem energia elétrica');
    await criar(tipoTI, 'HIGH', 'PDV fora do ar no horário de pico');
    await criar(tipoGeral, 'HIGH', 'Porta de emergência trancada');

    expect(await descricoes({ critical: true })).toEqual([
      'PDV fora do ar no horário de pico',
      'Porta de emergência trancada',
      'Unidade sem energia elétrica',
    ]);
  });

  it('deixa de fora Baixa e Média', async () => {
    await criar(tipoGeral, 'LOW', 'Lâmpada do corredor piscando');
    await criar(tipoGeral, 'MEDIUM', 'Cardápio rasgado');
    await criar(tipoGeral, 'HIGH', 'Vazamento de gás');

    expect(await descricoes({ critical: true })).toEqual(['Vazamento de gás']);
  });

  it('as duas gravidades da lente são exatamente Alta e Crítica', () => {
    /* Escrito à mão de propósito: mudar isto muda o que a supervisão vê como
       "crítico", e a mudança tem de ser deliberada. */
    expect(GRAVIDADES_CRITICAS).toEqual(['HIGH', 'CRITICAL']);
  });
});

describe('A ocorrência crítica NÃO sai da aba do assunto', () => {
  it('a falta de energia aparece em Manutenção E em Geral Crítico', async () => {
    /* É o caso que motivou a decisão: tirar isto de Manutenção esconderia de
       quem conserta justamente o pior problema do dia. */
    await criar(tipoManutencao, 'CRITICAL', 'Unidade sem energia elétrica');

    expect(await descricoes({ maintenance: true })).toEqual(['Unidade sem energia elétrica']);
    expect(await descricoes({ critical: true })).toEqual(['Unidade sem energia elétrica']);
  });

  it('o mesmo vale para TI', async () => {
    await criar(tipoTI, 'HIGH', 'Computador do caixa não inicia');
    expect(await descricoes({ it: true })).toEqual(['Computador do caixa não inicia']);
    expect(await descricoes({ critical: true })).toEqual(['Computador do caixa não inicia']);
  });
});

describe('As abas antigas não mudaram', () => {
  it('Manutenção continua trazendo as de manutenção, críticas ou não', async () => {
    await criar(tipoManutencao, 'LOW', 'Torneira pingando');
    await criar(tipoManutencao, 'CRITICAL', 'Sem energia');
    await criar(tipoTI, 'HIGH', 'PDV travado');

    expect(await descricoes({ maintenance: true })).toEqual(['Sem energia', 'Torneira pingando']);
  });

  it('e a visão sem filtro traz tudo', async () => {
    await criar(tipoGeral, 'LOW', 'a');
    await criar(tipoManutencao, 'CRITICAL', 'b');
    await criar(tipoTI, 'HIGH', 'c');
    expect(await descricoes({})).toEqual(['a', 'b', 'c']);
  });
});

describe('A lente respeita os outros filtros', () => {
  it('crítica + encerrada devolve só a que é as duas coisas', async () => {
    const aberta = await criar(tipoGeral, 'CRITICAL', 'crítica aberta');
    const fechada = await criar(tipoGeral, 'CRITICAL', 'crítica encerrada');
    if (fechada.ok) await prisma.occurrence.update({ where: { id: fechada.id }, data: { status: 'CLOSED' } });
    expect(aberta.ok).toBe(true);

    expect(await descricoes({ critical: true, status: 'CLOSED' })).toEqual(['crítica encerrada']);
    expect(await descricoes({ critical: true, status: 'OPEN' })).toEqual(['crítica aberta']);
  });

  it('e o escopo por unidade continua valendo', async () => {
    await criar(tipoGeral, 'CRITICAL', 'da minha unidade');
    const forasteiro: SessionUser = { id: 'z', name: 'Outro', role: 'MANAGER', unitIds: ['outra-unidade'], seesAllUnits: false, needsTerms: false };
    const r = await listOccurrences(forasteiro, { critical: true });
    expect(r.items.map((o) => o.description)).not.toContain('da minha unidade');
  });
});
