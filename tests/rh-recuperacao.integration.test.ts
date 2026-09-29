import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { analisarInativos, reativarInativadosPorAusencia } from '@/lib/rh/recuperacao';
import type { RhApi } from '@/lib/rh/transporte';
import type { SessionUser } from '@/lib/auth/session';

/**
 * RECUPERAÇÃO dos inativados por ausência (v1.132.1): o RH de hoje é a
 * testemunha. Quem está inativo no SGO mas o RH devolve trabalhando foi
 * inativado só por ausência na lista — e só esses são reativados.
 */
const sfx = `rc${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string; let outraUnitId: string; let adminId: string; let supId: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [], seesAllUnits: false, needsTerms: false });

const colab = (matricula: string, nome: string, status: string, unidade: string, unidade_cnpj: string | null) =>
  ({ matricula, nome, cpf: null, status, unidade, unidade_cnpj, cargo: 'Garçom', admissao: null });

/** O RH de mentira: quem ele devolve e com qual status. */
const rhFalso: RhApi = {
  colaboradores: async () => ({ data: [
    colab(`M${sfx}A`, `AUSENTE INDEVIDO ${sfx}`, 'Ativo', 'OUTRA EMPRESA', '99.999.999/0001-99'), // transferido: RH diz ativo, em outra empresa
    colab(`M${sfx}F`, `FERIAS INDEVIDO ${sfx}`, 'Férias', 'EMPRESA X', '11111111000111'),
    colab(`M${sfx}D`, `DEMITIDO LEGITIMO ${sfx}`, 'Demitido', 'EMPRESA X', '11111111000111'),
    colab(`M${sfx}V`, `ATIVO NORMAL ${sfx}`, 'Ativo', 'EMPRESA X', '11111111000111'),
  ] }),
  unidades: async () => ({ data: [] }),
  colaboradoresDaUnidade: async () => ({ data: [] }),
};

const ids: Record<string, string> = {};

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `RC-${sfx}`, name: `U Recuperação ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, cnpj: '11.111.111/0001-11' } })).id;
  outraUnitId = (await prisma.unit.create({ data: { code: `RC2-${sfx}`, name: `U Destino ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, cnpj: '99.999.999/0001-99' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  const mk = async (chave: string, name: string, active: boolean, externalId: string | null) => {
    ids[chave] = (await prisma.collaborator.create({ data: { name, active, source: 'RH', externalId, units: { create: { unitId } } } })).id;
  };
  await mk('A', `AUSENTE INDEVIDO ${sfx}`, false, `M${sfx}A`);
  await mk('F', `FERIAS INDEVIDO ${sfx}`, false, `M${sfx}F`);
  await mk('D', `DEMITIDO LEGITIMO ${sfx}`, false, `M${sfx}D`);
  await mk('N', `NAO CONSTA ${sfx}`, false, `M${sfx}N`);
  await mk('S', `SEM MATRICULA ${sfx}`, false, null);
  await mk('V', `ATIVO NORMAL ${sfx}`, true, `M${sfx}V`);
});

afterAll(async () => {
  const all = Object.values(ids);
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: all } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: all } } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnitId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supId] } } });
  await prisma.$disconnect();
});

describe('análise dos inativos', () => {
  it('classifica cada inativo pelo que o RH diz hoje; ativos não entram', async () => {
    const a = await analisarInativos(admin(), unitId, rhFalso);
    expect(a?.erro).toBeNull();
    const por = Object.fromEntries((a?.itens ?? []).map((i) => [i.externalId ?? 'sem', i.motivo]));
    expect(por[`M${sfx}A`]).toBe('INATIVADO_POR_AUSENCIA');
    expect(por[`M${sfx}F`]).toBe('INATIVADO_POR_AUSENCIA'); // Férias é vínculo ativo
    expect(por[`M${sfx}D`]).toBe('DESLIGADO_NO_RH');
    expect(por[`M${sfx}N`]).toBe('NAO_CONSTA_NO_RH');
    expect(por.sem).toBe('SEM_MATRICULA');
    expect(a?.itens.some((i) => i.externalId === `M${sfx}V`)).toBe(false);
    expect(a?.resumo).toEqual({ INATIVADO_POR_AUSENCIA: 2, DESLIGADO_NO_RH: 1, NAO_CONSTA_NO_RH: 1, SEM_MATRICULA: 1 });
    // pista de transferência: a empresa do RH tem CNPJ de outra unidade do SGO
    const transferido = a?.itens.find((i) => i.externalId === `M${sfx}A`);
    expect(transferido?.unidadeDoCnpjNoSgo).toBe(`U Destino ${sfx}`);
    expect(transferido?.statusNoRh).toBe('Ativo');
  });
});

describe('reativação', () => {
  it('só Admin; reativa SÓ os inativados por ausência entre os ids pedidos; o resto é ignorado e contado', async () => {
    expect((await reativarInativadosPorAusencia(sup(), unitId, [ids.A], {}, rhFalso)).ok).toBe(false);
    const r = await reativarInativadosPorAusencia(admin(), unitId, [ids.A, ids.F, ids.D, ids.N, ids.S], {}, rhFalso);
    expect(r.ok && r.reativados === 2 && r.ignorados === 3).toBe(true);
    const estado = await prisma.collaborator.findMany({ where: { id: { in: Object.values(ids) } }, select: { externalId: true, active: true } });
    const ativo = Object.fromEntries(estado.map((c) => [c.externalId ?? 'sem', c.active]));
    expect(ativo[`M${sfx}A`]).toBe(true);
    expect(ativo[`M${sfx}F`]).toBe(true);
    expect(ativo[`M${sfx}D`]).toBe(false); // desligado de verdade fica inativo
    expect(ativo[`M${sfx}N`]).toBe(false); // não consta no RH fica como está
    expect(ativo.sem).toBe(false);
    const log = await prisma.auditLog.findFirst({ where: { unitId, action: 'RH_REACTIVATE_ABSENT' } });
    expect((log?.metadata as { reativados?: number })?.reativados).toBe(2);
    // idempotente: rodar de novo não reativa ninguém (já estão ativos)
    const r2 = await reativarInativadosPorAusencia(admin(), unitId, [ids.A, ids.F], {}, rhFalso);
    expect(r2.ok && r2.reativados === 0).toBe(true);
  });
});
