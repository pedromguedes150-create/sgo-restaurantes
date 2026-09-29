import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * SYNC pelo CNPJ (v1.132.0): a unidade com CNPJ recebe só quem tem aquele
 * `unidade_cnpj`; as outras empresas do RH são ignoradas sem erro; a
 * identificação por matrícula não muda (atualiza, não duplica); e a razão
 * social continua valendo para quem não tem CNPJ.
 */
let todosDoRh: unknown = { data: [] };
let porRazao: unknown = { data: [] };

vi.mock('@/lib/rh/transporte', async () => {
  const real = await vi.importActual<typeof import('@/lib/rh/transporte')>('@/lib/rh/transporte');
  return {
    ...real,
    rhDisponivel: async () => true,
    rh: {
      colaboradores: async () => todosDoRh,
      colaboradoresDaUnidade: async () => porRazao,
      unidades: async () => ({ data: [] }),
    },
  };
});

import { prisma } from '@/lib/db/prisma';
import { syncCollaboratorsForUnit, syncAllRegisteredUnits } from '@/lib/rh/sync';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `sc${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const CNPJ_A = '12345678000190';
const CNPJ_B = '99999999000199';
let unitA: string; let unitB: string; let unitC: string; let adminId: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

const colab = (matricula: string, nome: string, cnpj: string | null, unidade: string, status = 'Ativo') =>
  ({ matricula, nome, cpf: null, status, unidade, unidade_cnpj: cnpj, cargo: 'Atendente', admissao: null });

async function nomesAtivos(unitId: string) {
  return (await prisma.collaborator.findMany({ where: { source: 'RH', active: true, units: { some: { unitId } } }, orderBy: { name: 'asc' }, select: { name: true } })).map((c) => c.name);
}

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  const u = async (code: string, name: string, extra: Record<string, unknown>) => (await prisma.unit.create({ data: { code, name, timezone: 'America/Sao_Paulo', cutoffHour: 4, ...extra } })).id;
  unitA = await u(`SC-A-${sfx}`, 'U CNPJ A', { cnpj: '12.345.678/0001-90', rhUnitName: `A LTDA ${sfx}` });
  unitB = await u(`SC-B-${sfx}`, 'U CNPJ B', { cnpj: CNPJ_B });
  unitC = await u(`SC-C-${sfx}`, 'U Razão', { rhUnitName: `C LTDA ${sfx}` });
});

afterAll(async () => {
  const ids = (await prisma.collaborator.findMany({ where: { externalId: { startsWith: `M${sfx}` } }, select: { id: true } })).map((c) => c.id);
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: ids } } });
  await prisma.trainingRecord.deleteMany({ where: { collaboratorId: { in: ids } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB, unitC] } } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe('sync por CNPJ', () => {
  it('a unidade recebe só quem tem o seu unidade_cnpj; empresas fora do SGO são ignoradas sem erro', async () => {
    todosDoRh = { data: [
      colab(`M${sfx}1`, `ANA ${sfx}`, '12.345.678/0001-90', 'A LTDA'),
      colab(`M${sfx}2`, `BIA ${sfx}`, CNPJ_B, 'B LTDA'),
      colab(`M${sfx}3`, `CAIO ${sfx}`, '55.555.555/0001-55', 'EMPRESA QUE NAO E DO SGO'),
      colab(`M${sfx}4`, `DEMITIDO ${sfx}`, CNPJ_A, 'A LTDA', 'Demitido'),
    ] };
    const r = await syncCollaboratorsForUnit(admin(), unitA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.total).toBe(2); // Ana + o demitido (que entra inativo)
    expect(await nomesAtivos(unitA)).toEqual([`ANA ${sfx}`]);
    expect(await nomesAtivos(unitB)).toEqual([]); // nada foi para a outra unidade
    expect(await prisma.collaborator.count({ where: { externalId: `M${sfx}3` } })).toBe(0); // fora do SGO: nem criado
    const audit = await prisma.auditLog.findFirst({ where: { unitId: unitA, action: 'RH_SYNC_COLLABORATORS' }, orderBy: { createdAt: 'desc' } });
    expect((audit?.metadata as { vinculo?: string })?.vinculo).toBe('CNPJ');
  });

  it('segunda passada ATUALIZA pela matrícula — não duplica ninguém', async () => {
    todosDoRh = { data: [colab(`M${sfx}1`, `ANA MARIA ${sfx}`, CNPJ_A, 'A LTDA')] };
    const r = await syncCollaboratorsForUnit(admin(), unitA);
    expect(r.ok && r.updated === 1 && r.created === 0).toBe(true);
    expect(await prisma.collaborator.count({ where: { externalId: `M${sfx}1` } })).toBe(1);
    expect(await nomesAtivos(unitA)).toEqual([`ANA MARIA ${sfx}`]);
  });

  it('status desconhecido (Aposentado) e Férias NÃO inativam', async () => {
    todosDoRh = { data: [colab(`M${sfx}1`, `ANA MARIA ${sfx}`, CNPJ_A, 'A LTDA', 'Férias'), colab(`M${sfx}5`, `APOSENTADO ${sfx}`, CNPJ_A, 'A LTDA', 'Aposentado')] };
    const r = await syncCollaboratorsForUnit(admin(), unitA);
    expect(r.ok).toBe(true);
    expect(await nomesAtivos(unitA)).toEqual([`ANA MARIA ${sfx}`, `APOSENTADO ${sfx}`]);
  });

  it('unidade sem CNPJ continua pela razão social — filtrando a MESMA lista completa, sem montar URL com o nome', async () => {
    todosDoRh = { data: [colab(`M${sfx}1`, `ANA MARIA ${sfx}`, CNPJ_A, 'A LTDA'), colab(`M${sfx}2`, `BIA ${sfx}`, CNPJ_B, 'B LTDA'), colab(`M${sfx}6`, `CARLA ${sfx}`, null, `C LTDA ${sfx}`)] };
    porRazao = { data: [] }; // o endpoint por unidade não é mais consultado
    const r = await syncAllRegisteredUnits(admin());
    expect(r.ok).toBe(true);
    expect(await nomesAtivos(unitB)).toEqual([`BIA ${sfx}`]);
    expect(await nomesAtivos(unitC)).toEqual([`CARLA ${sfx}`]);
    expect(await prisma.collaborator.count({ where: { externalId: `M${sfx}1` } })).toBe(1);
  });

  it('razão social com "&", parênteses e acento (o caso do Centro de Distribuição) casa sem passar por URL', async () => {
    const razao = `COMERCIAL LINS & GUEDES LTDA (CENTRO DE DISTRIBUIÇÃO ${sfx})`;
    const unitCd = (await prisma.unit.create({ data: { code: `SC-CD-${sfx}`, name: 'U CD', timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: razao } })).id;
    try {
      todosDoRh = { data: [colab(`M${sfx}7`, `DANI ${sfx}`, null, `Comercial Lins & Guedes Ltda (Centro de Distribuicao ${sfx})`), colab(`M${sfx}1`, `ANA MARIA ${sfx}`, CNPJ_A, 'A LTDA')] };
      const r = await syncCollaboratorsForUnit(admin(), unitCd);
      expect(r.ok && r.total === 1).toBe(true);
      expect(await nomesAtivos(unitCd)).toEqual([`DANI ${sfx}`]);
    } finally {
      await prisma.collaboratorUnit.deleteMany({ where: { unitId: unitCd } });
      await prisma.unit.delete({ where: { id: unitCd } });
    }
  });

  it('erro na consulta (4xx/5xx/timeout/formato) ABORTA a unidade: nada criado, atualizado ou inativado, e nunca vira lista vazia', async () => {
    const antes = await prisma.collaborator.findMany({ where: { externalId: { startsWith: `M${sfx}` } }, select: { externalId: true, name: true, active: true }, orderBy: { externalId: 'asc' } });
    todosDoRh = { success: false, error: 'Service Unavailable' }; // formato de erro que escapou
    const r = await syncCollaboratorsForUnit(admin(), unitA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('RH_ERROR');
    const depois = await prisma.collaborator.findMany({ where: { externalId: { startsWith: `M${sfx}` } }, select: { externalId: true, name: true, active: true }, orderBy: { externalId: 'asc' } });
    expect(depois).toEqual(antes);
  });
});
