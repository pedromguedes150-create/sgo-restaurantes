import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getUsoDoSgo } from '@/lib/metas/uso';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Uso do SGO (v1.164.0): por unidade e por usuário, lido da Auditoria, das
 * tarefas e do painel de uso — com escopo por unidade no servidor.
 */
const sfx = `uso${process.pid.toString(36)}`;
let unitA: string; let unitB: string; let gerA: string; let gerB: string; let gerAB: string; let supId: string; let caixa: string;
const supervisor = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: 'adm', name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const ym = new Date().toISOString().slice(0, 7);

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `UA-${sfx}`, name: `Uso A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `UB-${sfx}`, name: `Uso B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerA = (await prisma.user.create({ data: { name: `Ger A ${sfx}`, email: `ga-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x', lastLoginAt: new Date() } })).id;
  gerB = (await prisma.user.create({ data: { name: `Ger B ${sfx}`, email: `gb-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: `Sup ${sfx}`, email: `s-${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  caixa = (await prisma.user.create({ data: { name: `Caixa ${sfx}`, email: `c-${sfx}@example.com`, role: 'CASHIER', passwordHash: 'x' } })).id;
  /* gerente das DUAS unidades: a nota dele é a média (v1.179.0) */
  gerAB = (await prisma.user.create({ data: { name: `Ger AB ${sfx}`, email: `gab-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerA, unitId: unitA }, { userId: gerB, unitId: unitB }, { userId: gerAB, unitId: unitA }, { userId: gerAB, unitId: unitB }, { userId: supId, unitId: unitA }, { userId: caixa, unitId: unitA }] });
  await prisma.managerLeave.create({ data: { userId: gerA, startDate: `${ym}-10`, endDate: `${ym}-10`, createdById: gerA } });
  const tpl = await prisma.taskTemplate.create({ data: { unitId: unitA, name: `T ${sfx}`, limitTime: '10:00' } });
  await prisma.taskInstance.createMany({ data: [
    { templateId: tpl.id, unitId: unitA, operationalDate: `${ym}-03`, dueAt: new Date(), status: 'DONE', completedById: gerA, completedAt: new Date() },
    { templateId: tpl.id, unitId: unitA, operationalDate: `${ym}-04`, dueAt: new Date(), status: 'LATE', completedById: gerA, completedAt: new Date() },
    { templateId: tpl.id, unitId: unitA, operationalDate: `${ym}-05`, dueAt: new Date(), status: 'MISSED' },
    /* v1.182.0 — abertas: uma ainda no prazo (vence daqui a 1 dia), uma vencida (prazo passou ontem) */
    { templateId: tpl.id, unitId: unitA, operationalDate: `${ym}-06`, dueAt: new Date(Date.now() + 86_400_000), status: 'PENDING' },
    { templateId: tpl.id, unitId: unitA, operationalDate: `${ym}-07`, dueAt: new Date(Date.now() - 86_400_000), status: 'PENDING' },
  ] });
  await prisma.auditLog.createMany({ data: [
    { userId: gerA, unitId: unitA, action: 'LOGIN', module: 'AUTH' },
    { userId: gerA, unitId: unitA, action: 'LOGIN', module: 'AUTH' },
    { userId: gerA, unitId: unitA, action: 'TASK_DONE', module: 'TASKS' },
    { userId: gerA, unitId: unitA, action: 'TASK_DONE', module: 'TASKS' },
    { userId: gerA, unitId: unitA, action: 'WASTE_ENTRY', module: 'WASTE' },
    { userId: caixa, unitId: unitA, action: 'COMMAND_COUNT', module: 'COMMANDS' },
  ] });
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.taskInstance.deleteMany({ where: { unitId: unitA } });
  await prisma.taskTemplate.deleteMany({ where: { unitId: unitA } });
  await prisma.managerLeave.deleteMany({ where: { userId: { in: [gerA, gerAB] } } });
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [gerA, gerB, gerAB, supId, caixa] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerA, gerB, gerAB, supId, caixa] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
});

describe('getUsoDoSgo', () => {
  it('por unidade: tarefas por situação, ações da Auditoria sem login e usuários ativos/vinculados', async () => {
    const d = await getUsoDoSgo(admin(), ym);
    const a = d.unidades.find((u) => u.unitId === unitA)!;
    expect(a).toMatchObject({ done: 1, late: 1, missed: 1, acoes: 4, usuariosAtivos: 2 });
    expect(a.usuariosVinculados).toBe(3); // gerente A + gerente das duas unidades + supervisor (o caixa não é medido)
    /* v1.182.0 — PR B: abertas separadas pelo prazo, responsáveis = gerentes/coordenadores vinculados, descontos nomeados */
    expect(a).toMatchObject({ pendentes: 1, vencidas: 1 });
    expect(a.responsaveis).toEqual(expect.arrayContaining([`Ger A ${sfx}`, `Ger AB ${sfx}`]));
    expect(a.responsaveis).not.toContain(`Sup ${sfx}`);
    expect(Array.isArray(a.descontos)).toBe(true);
    expect(d.resumo.pendencias.pendentes).toBeGreaterThanOrEqual(1); // o resumo é da rede inteira do banco de dev
    expect(d.resumo.pendencias.vencidas).toBeGreaterThanOrEqual(1);
  });
  it('por usuário (v1.182.0): pontualidade do que a própria pessoa concluiu; abertas/vencidas/não feitas das unidades dela', async () => {
    const d = await getUsoDoSgo(admin(), ym);
    const ga = d.usuarios.find((u) => u.userId === gerA)!;
    expect(ga).toMatchObject({ pontualidade: 50, pendentes: 1, vencidas: 1, naoRealizadas: 1 }); // 1 no prazo + 1 fora = 50%
    const gb = d.usuarios.find((u) => u.userId === gerB)!;
    expect(gb).toMatchObject({ pontualidade: null, pendentes: 0, vencidas: 0, naoRealizadas: 0 });
    const gab = d.usuarios.find((u) => u.userId === gerAB)!;
    expect(gab).toMatchObject({ pendentes: 1, vencidas: 1 }); // soma das duas unidades (B não tem nada)
  });
  it('por usuário: acessos, ações, módulos por frequência, tarefas no prazo e fora; caixa fica de fora', async () => {
    const d = await getUsoDoSgo(admin(), ym);
    const ga = d.usuarios.find((u) => u.userId === gerA)!;
    expect(ga).toMatchObject({ acessos: 2, acoes: 3, tarefasConcluidas: 1, foraDoPrazo: 1, roleLabel: 'Gerente' });
    expect(ga.modulos).toEqual(['TASKS', 'WASTE']);
    expect(ga.ultimoAcesso).not.toBeNull();
    expect(ga.unidades).toEqual([`Uso A ${sfx}`]);
    expect(d.usuarios.some((u) => u.userId === caixa)).toBe(false);
    expect(d.usuarios.find((u) => u.userId === gerB)).toMatchObject({ acoes: 0, acessos: 0 });
  });
  it('meta por usuário (v1.179.0): o gerente herda a nota da unidade; em duas unidades, a média; a folga própria é individual', async () => {
    const d = await getUsoDoSgo(admin(), ym);
    const a = d.unidades.find((u) => u.unitId === unitA)!;
    const b = d.unidades.find((u) => u.unitId === unitB)!;
    const ga = d.usuarios.find((u) => u.userId === gerA)!;
    expect(ga.meta).not.toBeNull();
    /* a MESMA nota da unidade — a da aba Metas e do painel do supervisor */
    expect(ga.meta!.scorePct).toBe(a.metaPct);
    expect(ga.meta!.unidades.map((x) => x.unitId)).toEqual([unitA]);
    expect(ga.meta!.componentes.some((c) => c.key === 'TASKS' && c.weight > 0)).toBe(true);
    expect(d.pesosDaMeta.some((p) => p.key === 'TASKS')).toBe(true);
    const gab = d.usuarios.find((u) => u.userId === gerAB)!;
    expect(gab.meta!.unidades).toHaveLength(2);
    expect(gab.meta!.scorePct).toBe(Math.round((a.metaPct + b.metaPct) / 2));
    /* folga própria: gerA lançou, gerB não; supervisor não é medido nisso */
    expect(ga.folgaPropria).toBe(true);
    expect(d.usuarios.find((u) => u.userId === gerB)!.folgaPropria).toBe(false);
    expect(d.usuarios.find((u) => u.userId === supId)!.folgaPropria).toBeNull();
    /* v1.180.0 (regra do Pedro): o supervisor NÃO entra na conferência da bonificação — sem nota; segue medido em acessos/ações */
    expect(d.usuarios.find((u) => u.userId === supId)!.meta).toBeNull();
    expect(d.usuarios.some((u) => u.userId === supId)).toBe(true);
    expect(Array.isArray(ga.meta!.descontos)).toBe(true);
    expect(d.resumo.notas.melhor).not.toBeNull();
  });
  it('escopo: o supervisor da unidade A não vê a unidade B nem o gerente dela', async () => {
    const d = await getUsoDoSgo(supervisor(), ym);
    expect(d.unidades.some((u) => u.unitId === unitB)).toBe(false);
    expect(d.unidades.some((u) => u.unitId === unitA)).toBe(true);
    expect(d.usuarios.some((u) => u.userId === gerB)).toBe(false);
    expect(d.usuarios.some((u) => u.userId === gerA)).toBe(true);
  });
});
