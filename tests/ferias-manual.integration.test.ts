import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { corrigirAdmissao, getFeriasDoColaborador, informarGozo } from '@/lib/people/ferias-manual';
import { getControleDeFerias, getPerfil360 } from '@/lib/people/perfil-360';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Férias preenchidas à mão (v1.154.0) com banco: corrigir a admissão (só
 * Supervisão/Admin/CEO, com motivo; a do RH fica intacta) e informar dias
 * gozados por período (abate o saldo, faz o período "anterior" ser julgado).
 */
const sfx = `fm${process.pid.toString(36)}`;
let unitA: string, unitB: string, gerId: string, supId: string, colab: string, colabB: string;
const gerente = (): SessionUser => ({ id: gerId, name: 'Ger', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const supervisor = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `A-${sfx}`, name: `FM A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `B-${sfx}`, name: `FM B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerId = (await prisma.user.create({ data: { name: 'Ger', email: `g-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `s-${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  colab = (await prisma.collaborator.create({ data: { name: 'Ana Antiga', hireDate: '2022-03-01', source: 'RH', units: { create: [{ unitId: unitA }] } } })).id;
  colabB = (await prisma.collaborator.create({ data: { name: 'Bia Outra', hireDate: '2024-01-10', units: { create: [{ unitId: unitB }] } } })).id;
});

afterAll(async () => {
  await prisma.collaborator.deleteMany({ where: { id: { in: [colab, colabB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerId, supId] } } });
  await prisma.$disconnect();
});

describe('admissão corrigida à mão', () => {
  it('gerente não corrige; supervisor exige motivo; a do RH continua gravada', async () => {
    expect(await corrigirAdmissao(gerente(), { collaboratorId: colab, data: '2023-05-02', motivo: 'x' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await corrigirAdmissao(supervisor(), { collaboratorId: colab, data: '2023-05-02' })).toEqual({ ok: false, reason: 'MOTIVO' });
    expect((await corrigirAdmissao(supervisor(), { collaboratorId: colab, data: '2023-05-02', motivo: 'RH com a data da transferência' })).ok).toBe(true);
    const c = await prisma.collaborator.findUniqueOrThrow({ where: { id: colab } });
    expect(c.hireDate).toBe('2022-03-01');
    expect(c.hireDateManual).toBe('2023-05-02');
    expect(c.hireDateManualBy).toBe('Sup');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'HIRE_DATE_MANUAL_SET', entityId: colab } });
    expect(audit).toBeTruthy();
  });

  it('o controle e o perfil passam a usar a corrigida', async () => {
    const pode = () => true;
    const p = (await getPerfil360(supervisor(), colab, pode))!;
    expect(p.colaborador.admissao).toBe('2023-05-02');
    expect(p.colaborador.admissaoRh).toBe('2022-03-01');
    expect(p.ferias.periodos[0].inicio).toBe('2023-05-02');
    const ctl = await getControleDeFerias(supervisor());
    expect(ctl.linhas.find((l) => l.id === colab)?.admissaoCorrigida).toBe(true);
  });

  it('limpar volta a usar a do RH', async () => {
    expect((await corrigirAdmissao(supervisor(), { collaboratorId: colab, data: null })).ok).toBe(true);
    const c = await prisma.collaborator.findUniqueOrThrow({ where: { id: colab } });
    expect(c.hireDateManual).toBeNull();
  });

  it('fora do alcance não corrige', async () => {
    expect(await corrigirAdmissao(supervisor(), { collaboratorId: colabB, data: '2024-02-01', motivo: 'x' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });
});

describe('dias gozados informados por período', () => {
  it('período anterior ao SGO informado com 20 dias fica vencido com saldo 10; com 30, quitado', async () => {
    expect((await informarGozo(gerente(), { collaboratorId: colab, periodoInicio: '2022-03-01', diasGozados: 20, observacao: 'férias de 2023' })).ok).toBe(true);
    let f = (await getFeriasDoColaborador(gerente(), colab))!;
    expect(f.periodos.find((p) => p.inicio === '2022-03-01')).toMatchObject({ diasInformados: 20, saldo: 10, situacao: 'VENCIDO' });
    await informarGozo(gerente(), { collaboratorId: colab, periodoInicio: '2022-03-01', diasGozados: 30 });
    f = (await getFeriasDoColaborador(gerente(), colab))!;
    expect(f.periodos.find((p) => p.inicio === '2022-03-01')?.situacao).toBe('QUITADO');
    expect(await prisma.vacationPeriodAdjust.count({ where: { collaboratorId: colab } })).toBe(1);
  });

  it('salvar 0 remove; período inexistente e mais de 30 são recusados', async () => {
    expect((await informarGozo(gerente(), { collaboratorId: colab, periodoInicio: '2022-03-01', diasGozados: 0 })).ok).toBe(true);
    expect(await prisma.vacationPeriodAdjust.count({ where: { collaboratorId: colab } })).toBe(0);
    expect(await informarGozo(gerente(), { collaboratorId: colab, periodoInicio: '2022-03-02', diasGozados: 5 })).toEqual({ ok: false, reason: 'PERIODO' });
    expect(await informarGozo(gerente(), { collaboratorId: colab, periodoInicio: '2022-03-01', diasGozados: 31 })).toEqual({ ok: false, reason: 'INVALID' });
    expect(await informarGozo(gerente(), { collaboratorId: colabB, periodoInicio: '2024-01-10', diasGozados: 5 })).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('registro preso a período que sumiu (admissão mudou) é apontado como órfão', async () => {
    await informarGozo(gerente(), { collaboratorId: colab, periodoInicio: '2023-03-01', diasGozados: 10 });
    await corrigirAdmissao(supervisor(), { collaboratorId: colab, data: '2023-05-02', motivo: 'teste' });
    const f = (await getFeriasDoColaborador(gerente(), colab))!;
    expect(f.orfaos).toEqual([{ tipo: 'Gozo informado', periodoInicio: '2023-03-01', dias: 10 }]);
  });
});
