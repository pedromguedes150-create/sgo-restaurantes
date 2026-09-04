import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A folha "Configuração de escala do colaborador" (Pessoas → Colaboradores)
 * chamando a ROTA com o corpo EXATO que ela monta.
 *
 * Relato: "não está gravando". A função `salvarEscalaDoColaborador` já tinha
 * teste; o que faltava era passar pela rota com o corpo da folha — foi assim
 * que apareceu o campo que morria no caminho na conferência em grade (v1.54.1).
 */

const sfx = `sh${process.pid.toString(36)}`;
let unitId: string;
let userId: string;
let tipoId: string;
let colaboradorId: string;
let papel: SessionUser['role'] = 'ADMIN';

const user = (): SessionUser => ({ id: userId, name: 'Alan', role: papel, unitIds: [unitId], seesAllUnits: papel === 'ADMIN', needsTerms: false });

vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionUser: async () => user(),
}));

async function post(body: unknown) {
  const { POST } = await import('@/app/api/schedule/route');
  const res = await POST(new Request('http://localhost/api/schedule', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

/** O corpo que `EmployeeScheduleForm` monta quando aberto DENTRO do colaborador. */
function corpoDaFolha(over: Record<string, unknown> = {}) {
  return {
    action: 'saveEmployeeSchedule',
    collaboratorId: colaboradorId,
    unitId,
    templateId: tipoId,
    startDate: '2026-09-04',
    offMode: 'FIXED_WEEKLY',
    weeklyOffDay: 0,
    sundayEveryWeeks: null,
    anchorDate: null,
    shiftId: null,
    startTime: '14:00',
    breakTime: '19:00',
    endTime: '22:17',
    ...over,
  };
}

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `SH-${sfx}`, name: 'U Folha', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Alan', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  tipoId = (await prisma.scheduleTemplate.create({ data: { name: `6x1 Folha ${sfx}`, workDays: 6, offDays: 1, startTime: '14:00', endTime: '22:17' } })).id;
  colaboradorId = (await prisma.collaborator.create({ data: { name: `ALESSANDRA ${sfx}`, jobTitle: 'Aux. de Cozinha', units: { create: { unitId } } } })).id;
});

afterAll(async () => {
  await prisma.employeeSchedule.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaborator.delete({ where: { id: colaboradorId } }).catch(() => {});
  await prisma.scheduleTemplate.delete({ where: { id: tipoId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('A folha do colaborador grava pela rota', () => {
  it('o corpo da folha é aceito e a escala fica gravada', async () => {
    const r = await post(corpoDaFolha());
    expect(r.status, `resposta: ${JSON.stringify(r.data)}`).toBe(200);

    const v = await prisma.employeeSchedule.findFirst({ where: { collaboratorId: colaboradorId, unitId, endDate: null } });
    expect(v, 'a vigência deveria existir').toBeTruthy();
    expect(v!.weeklyOffDay).toBe(0);
    expect(v!.startTime).toBe('14:00');
    expect(v!.templateId).toBe(tipoId);
  });

  it('gravar de novo abre vigência nova e fecha a anterior na véspera', async () => {
    const r = await post(corpoDaFolha({ startDate: '2026-09-10', weeklyOffDay: 3 }));
    expect(r.status, `resposta: ${JSON.stringify(r.data)}`).toBe(200);

    const todas = await prisma.employeeSchedule.findMany({ where: { collaboratorId: colaboradorId, unitId }, orderBy: { startDate: 'asc' } });
    expect(todas).toHaveLength(2);
    expect(todas[0].endDate?.toISOString().slice(0, 10)).toBe('2026-09-09');
    expect(todas[1].endDate).toBeNull();
    expect(todas[1].weeklyOffDay).toBe(3);
  });
});

describe('Quando a matriz de perfis entra no caminho', () => {
  it('o Gerente com a aba Planejado fechada NÃO deveria perder o cadastro da escala', async () => {
    /* O cadastro é a configuração do colaborador, não a edição do Planejado do
       mês. Se a guarda da rota confundir os dois, fechar uma aba tira do gerente
       a capacidade de cadastrar escala — e a tela não diz por quê. */
    papel = 'MANAGER';
    await prisma.rolePermission.upsert({
      where: { role_module: { role: 'MANAGER', module: 'SCHEDULE_TAB_PLANNED' } },
      create: { role: 'MANAGER', module: 'SCHEDULE_TAB_PLANNED', canView: true, canEdit: false },
      update: { canView: true, canEdit: false },
    });
    try {
      const r = await post(corpoDaFolha({ startDate: '2026-09-20', weeklyOffDay: 5 }));
      expect(r.status, `resposta: ${JSON.stringify(r.data)}`).toBe(200);
    } finally {
      papel = 'ADMIN';
      await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: 'SCHEDULE_TAB_PLANNED' } });
    }
  });
});
