import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Várias razões sociais por unidade (v1.166.0) — o caso Nova União: a
 * churrascaria tem gente em "LINS & GUEDES (NOVA UNIÃO)" e em "BEIJA FLOR NOVA
 * UNIÃO LTDA". O RH é simulado com as duas listas.
 */
const sfx = Date.now().toString(36);
const PRINCIPAL = `LINS GUEDES NOVA UNIAO ${sfx}`;
const NOVA = `COMERCIAL BEIJA FLOR NOVA UNIAO ${sfx}`;
const CNPJ_NOVA = '42790781000105';
const listas: Record<string, unknown[]> = {
  [PRINCIPAL]: [
    { matricula: `T${sfx}-1`, nome: 'ANA CLAUDIA', status: 'Ativo', unidade: PRINCIPAL, unidade_cnpj: '05336082000910', cargo: 'Aux', admissao: null, cpf: null },
    { matricula: `T${sfx}-9`, nome: 'REPETIDA', status: 'Ativo', unidade: PRINCIPAL, unidade_cnpj: '05336082000910', cargo: 'Aux', admissao: null, cpf: null },
  ],
  [NOVA]: [
    { matricula: `T${sfx}-20519`, nome: 'ANA LUCIA VIEIRA SANTOS', status: '2ª Experiência', unidade: NOVA, unidade_cnpj: CNPJ_NOVA, cargo: 'AUXILIAR DE COZINHA', admissao: '2026-08-04', cpf: null },
    { matricula: `T${sfx}-9`, nome: 'REPETIDA', status: 'Ativo', unidade: NOVA, unidade_cnpj: CNPJ_NOVA, cargo: 'Aux', admissao: null, cpf: null },
  ],
};
let falharEm: string | null = null;

vi.mock('@/lib/rh/client', () => ({
  rhConfigured: () => true,
  RhApiError: class RhApiError extends Error {},
  rh: {
    unidades: async () => ({ data: Object.keys(listas) }),
    colaboradores: async () => ({ data: Object.values(listas).flat() }),
    colaboradoresDaUnidade: async (nome: string) => {
      if (falharEm === nome) throw new Error('timeout simulado');
      return { data: listas[nome] ?? [] };
    },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { adicionarRazaoSocial, removerRazaoSocial, unidadeDaRazaoSocial, conferenciaDasRazoes } from '@/lib/rh/razoes';
import { syncCollaboratorsForUnit } from '@/lib/rh/sync';
import type { SessionUser } from '@/lib/auth/session';

let unitA: string; let unitB: string; let adminId: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: adminId, name: 'Ger', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `adm-raz-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  unitA = (await prisma.unit.create({ data: { code: `RA-${sfx}`, name: `Nova União ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: PRINCIPAL } })).id;
  unitB = (await prisma.unit.create({ data: { code: `RB-${sfx}`, name: `Outra ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: `OUTRA PRINCIPAL ${sfx}` } })).id;
});
afterAll(async () => {
  const ids = (await prisma.collaborator.findMany({ where: { externalId: { startsWith: `T${sfx}-` } }, select: { id: true } })).map((c) => c.id);
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: ids } } });
  await prisma.trainingRecord.deleteMany({ where: { collaboratorId: { in: ids } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.unitRhSource.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
});

describe('razão social adicional', () => {
  it('só Admin liga; o critério é conferido contra o RH', async () => {
    expect(await adicionarRazaoSocial(gerente(), unitA, 'CNPJ', CNPJ_NOVA)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await adicionarRazaoSocial(admin(), unitA, 'NOME', NOVA.toLowerCase())).toMatchObject({ ok: false, reason: 'NOME_NAO_IDENTICO' });
    expect(await adicionarRazaoSocial(admin(), unitA, 'NOME', PRINCIPAL)).toEqual({ ok: false, reason: 'JA_E_A_PRINCIPAL' });
    const r = await adicionarRazaoSocial(admin(), unitA, 'CNPJ', '42.790.781/0001-05');
    expect(r).toEqual({ ok: true, rhName: NOVA, criterio: 'CNPJ', cnpj: CNPJ_NOVA });
    const log = await prisma.auditLog.findFirst({ where: { unitId: unitA, action: 'UNIT_RH_SOURCE_ADD' } });
    expect(log?.metadata).toMatchObject({ rhName: NOVA, criterio: 'CNPJ' });
  });

  it('uma razão social pertence a UMA unidade só', async () => {
    expect(await adicionarRazaoSocial(admin(), unitB, 'NOME', NOVA)).toMatchObject({ ok: false, reason: 'JA_VINCULADA', unidade: `Nova União ${sfx}` });
    expect(await adicionarRazaoSocial(admin(), unitB, 'NOME', PRINCIPAL)).toMatchObject({ ok: false, reason: 'JA_VINCULADA' });
  });

  it('a sincronização lê as duas listas, a matrícula repetida vale uma vez e todos ficam na unidade', async () => {
    const r = await syncCollaboratorsForUnit(admin(), unitA);
    expect(r).toMatchObject({ ok: true, created: 3, updated: 0, total: 3 });
    const nomes = (await prisma.collaborator.findMany({ where: { units: { some: { unitId: unitA } }, externalId: { startsWith: `T${sfx}-` } }, orderBy: { name: 'asc' }, select: { name: true } })).map((c) => c.name);
    expect(nomes).toEqual(['ANA CLAUDIA', 'ANA LUCIA VIEIRA SANTOS', 'REPETIDA']);
    const log = await prisma.auditLog.findFirst({ where: { unitId: unitA, action: 'RH_SYNC_COLLABORATORS' }, orderBy: { createdAt: 'desc' } });
    expect(log?.metadata).toMatchObject({ razoesSociais: { [PRINCIPAL]: 2, [NOVA]: 2 } });
  });

  it('falha em QUALQUER razão social aborta a unidade sem gravar nada', async () => {
    const antes = await prisma.collaborator.count({ where: { externalId: { startsWith: `T${sfx}-` } } });
    listas[NOVA].push({ matricula: `T${sfx}-novo`, nome: 'NAO DEVE ENTRAR', status: 'Ativo', unidade: NOVA, cargo: null, admissao: null, cpf: null });
    falharEm = NOVA;
    const r = await syncCollaboratorsForUnit(admin(), unitA);
    falharEm = null;
    listas[NOVA].pop();
    expect(r).toMatchObject({ ok: false, reason: 'RH_ERROR' });
    expect(await prisma.collaborator.count({ where: { externalId: { startsWith: `T${sfx}-` } } })).toBe(antes);
  });

  it('o webhook do RH acha a unidade também pela razão social adicional', async () => {
    expect(await unidadeDaRazaoSocial(NOVA)).toEqual({ id: unitA });
    expect(await unidadeDaRazaoSocial(PRINCIPAL)).toEqual({ id: unitA });
    expect(await unidadeDaRazaoSocial(`INEXISTENTE ${sfx}`)).toBeNull();
  });

  it('a conferência por unidade mostra a adicional da Nova União e o nome inexistente da outra', async () => {
    const c = await conferenciaDasRazoes(admin());
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.conferencia.unidades.find((u) => u.unitId === unitA)).toMatchObject({ situacao: 'OK', adicionais: [{ nome: NOVA, existe: true, pessoas: 2 }], pessoasLidas: 4 });
    expect(c.conferencia.unidades.find((u) => u.unitId === unitB)?.situacao).toBe('NOME_NAO_EXISTE');
    expect(await conferenciaDasRazoes(gerente())).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('remover para de ler a razão social, mas não tira ninguém da unidade', async () => {
    const s = await prisma.unitRhSource.findUniqueOrThrow({ where: { rhName: NOVA } });
    expect(await removerRazaoSocial(admin(), s.id)).toEqual({ ok: true });
    expect(await unidadeDaRazaoSocial(NOVA)).toBeNull();
    const ana = await prisma.collaborator.findFirstOrThrow({ where: { externalId: `T${sfx}-20519` }, select: { active: true, units: { select: { unitId: true } } } });
    expect(ana).toEqual({ active: true, units: [{ unitId: unitA }] });
  });
});
