import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Escala de gerentes (v1.170.0):
 *  1. apagar exige MOTIVO — para a Supervisão também — e é exclusão LÓGICA:
 *     a linha some da grade, fica no banco com quem/quando/por quê;
 *  2. o GERENTE lança a própria folga só a partir de amanhã, e só apaga o que
 *     ele mesmo lançou e ainda não aconteceu; a Supervisão é avisada;
 *  3. "Hoje na rede" e o relatório da rede leem os mesmos lançamentos; o
 *     relatório é só do Admin e lista as exclusões com motivo;
 *  4. a META desconta X% por gerente sem folga cadastrada no mês.
 */
const sfx = `mgp${process.pid.toString(36)}`;
let unitA: string, unitB: string;
let anaId: string, brunoId: string, carlaId: string, supId: string, adminId: string;
const avisos: { title: string; body: string }[] = [];

vi.mock('@/lib/notifications', () => ({
  notifyUsers: async () => undefined,
  notifyAdmins: async () => undefined,
  notifyRole: async () => undefined,
  notifyUnitRole: async () => undefined,
  notifySupervisory: async (p: { title: string; body: string }) => { avisos.push(p); },
}));

const HOJE = '2026-10-15';
const u = (id: string, role: SessionUser['role'], units: string[]): SessionUser =>
  ({ id, name: role === 'MANAGER' ? 'Ana' : role, role, unitIds: units, seesAllUnits: role === 'ADMIN', needsTerms: false });
const ana = () => ({ ...u(anaId, 'MANAGER', [unitA]), name: 'Ana' });
const bruno = () => ({ ...u(brunoId, 'MANAGER', [unitA]), name: 'Bruno' });
const sup = () => u(supId, 'SUPERVISOR', [unitA]);
const admin = () => ({ ...u(adminId, 'ADMIN', []), seesAllUnits: true });

beforeAll(async () => {
  const unit = async (code: string, name: string) => (await prisma.unit.create({ data: { code, name, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitA = await unit(`MGP-A-${sfx}`, `Centro ${sfx}`);
  unitB = await unit(`MGP-B-${sfx}`, `Orla ${sfx}`);
  const user = async (name: string, role: SessionUser['role'], unitId: string | null) => {
    const id = (await prisma.user.create({ data: { name, email: `${name}.${sfx}@e.com`, role, passwordHash: 'x' } })).id;
    if (unitId) await prisma.unitMembership.create({ data: { userId: id, unitId } });
    return id;
  };
  anaId = await user('Ana', 'MANAGER', unitA);
  brunoId = await user('Bruno', 'MANAGER', unitA);
  carlaId = await user('Carla', 'MANAGER', unitB);
  supId = await user('Sup', 'SUPERVISOR', unitA);
  adminId = await user('Admin', 'ADMIN', null);
  /* horário seg–sex para Ana e Bruno; Carla sem horário */
  for (const id of [anaId, brunoId]) await prisma.managerWorkSchedule.create({ data: { userId: id, weekdays: [1, 2, 3, 4, 5] } });
});

afterEach(async () => {
  await prisma.managerLeave.deleteMany({ where: { userId: { in: [anaId, brunoId, carlaId] } } });
  avisos.length = 0;
});

afterAll(async () => {
  const ids = [anaId, brunoId, carlaId, supId, adminId];
  await prisma.managerLeave.deleteMany({ where: { userId: { in: ids } } });
  await prisma.managerWorkSchedule.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.$disconnect();
});

describe('apagar exige motivo e é exclusão lógica', () => {
  it('Supervisão sem motivo é recusada; com motivo a linha fica no banco marcada e some da grade', async () => {
    const { lancarFolgaDoGerente, apagarFolgaDoGerente, getGradeDeGerentes } = await import('@/lib/manager-schedule-central');
    const r = await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-10-20', endDate: '2026-10-20' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const sem = await apagarFolgaDoGerente(sup(), r.id);
    expect(sem).toEqual({ ok: false, reason: 'SEM_MOTIVO' });
    const curto = await apagarFolgaDoGerente(sup(), r.id, 'erro');
    expect(curto).toEqual({ ok: false, reason: 'SEM_MOTIVO' });

    const ok = await apagarFolgaDoGerente(sup(), r.id, 'Troca de folga para o dia 22 a pedido da unidade');
    expect(ok.ok).toBe(true);

    const linha = await prisma.managerLeave.findUnique({ where: { id: r.id } });
    expect(linha).not.toBeNull();
    expect(linha?.deletedAt).not.toBeNull();
    expect(linha?.deletedById).toBe(supId);
    expect(linha?.deleteReason).toBe('Troca de folga para o dia 22 a pedido da unidade');

    const grade = await getGradeDeGerentes(sup(), unitA, 2026, 10);
    expect(grade?.lancamentos.some((l) => l.id === r.id)).toBe(false);
    expect(grade?.linhas.find((l) => l.userId === anaId)?.dias[19]).toBe('TRABALHA'); // dia 20 (terça) voltou a trabalhar

    /* apagar de novo não grava segundo motivo */
    const denovo = await apagarFolgaDoGerente(sup(), r.id, 'segundo clique no mesmo botão');
    expect(denovo).toEqual({ ok: false, reason: 'INVALID' });

    /* a Auditoria guarda o motivo */
    const log = await prisma.auditLog.findFirst({ where: { action: 'MANAGER_LEAVE_DELETE', entityId: r.id } });
    expect((log?.metadata as Record<string, unknown>)?.motivo).toBe('Troca de folga para o dia 22 a pedido da unidade');

    /* o dia excluído deixa de conflitar: lançar de novo no mesmo dia passa */
    const outra = await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-10-20', endDate: '2026-10-20' });
    expect(outra.ok).toBe(true);
  });
});

describe('o gerente lança a própria folga', () => {
  it('só a partir de amanhã, só para si; a Supervisão é avisada', async () => {
    const { lancarMinhaFolga } = await import('@/lib/manager-schedule-central');
    expect(await lancarMinhaFolga(ana(), { kind: 'FOLGA', startDate: '2026-10-14', endDate: '2026-10-14' }, HOJE)).toEqual({ ok: false, reason: 'DATA_PASSADA' });
    expect(await lancarMinhaFolga(ana(), { kind: 'FOLGA', startDate: HOJE, endDate: HOJE }, HOJE)).toEqual({ ok: false, reason: 'DATA_PASSADA' });
    expect(await lancarMinhaFolga(sup(), { kind: 'FOLGA', startDate: '2026-10-20', endDate: '2026-10-20' }, HOJE)).toEqual({ ok: false, reason: 'FORBIDDEN' });

    const r = await lancarMinhaFolga(ana(), { kind: 'FOLGA', startDate: '2026-10-20', endDate: '2026-10-21', note: 'casamento' }, HOJE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const linha = await prisma.managerLeave.findUnique({ where: { id: r.id } });
    expect(linha?.userId).toBe(anaId);
    expect(linha?.createdById).toBe(anaId);
    expect(avisos.some((a) => a.title.includes('Folga lançada pelo gerente') && a.body.includes('Ana'))).toBe(true);

    /* sobreposição com a dela mesma */
    expect(await lancarMinhaFolga(ana(), { kind: 'FOLGA', startDate: '2026-10-21', endDate: '2026-10-22' }, HOJE)).toEqual({ ok: false, reason: 'OVERLAP' });
  });

  it('apaga só o que ele lançou e ainda não aconteceu — com motivo; o que a Supervisão lançou não é dele', async () => {
    const { lancarMinhaFolga, apagarMinhaFolga, lancarFolgaDoGerente } = await import('@/lib/manager-schedule-central');
    const minha = await lancarMinhaFolga(ana(), { kind: 'FOLGA', startDate: '2026-10-20', endDate: '2026-10-20' }, HOJE);
    const daSup = await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-10-25', endDate: '2026-10-25' });
    if (!minha.ok || !daSup.ok) throw new Error('setup');

    expect(await apagarMinhaFolga(ana(), minha.id, '', HOJE)).toEqual({ ok: false, reason: 'SEM_MOTIVO' });
    expect(await apagarMinhaFolga(ana(), daSup.id, 'Não quero mais essa folga aqui', HOJE)).toEqual({ ok: false, reason: 'NAO_E_SEU' });
    expect(await apagarMinhaFolga(bruno(), minha.id, 'Apagando a folga da Ana por engano', HOJE)).toEqual({ ok: false, reason: 'NAO_E_SEU' });
    /* já passou (hoje avançou para depois da folga) */
    expect(await apagarMinhaFolga(ana(), minha.id, 'Tentando apagar o passado', '2026-10-21')).toEqual({ ok: false, reason: 'DATA_PASSADA' });

    const ok = await apagarMinhaFolga(ana(), minha.id, 'Vou trabalhar no dia 20, remarquei para novembro', HOJE);
    expect(ok.ok).toBe(true);
    const linha = await prisma.managerLeave.findUnique({ where: { id: minha.id } });
    expect(linha?.deletedById).toBe(anaId);
    expect(linha?.deleteReason).toContain('remarquei');
    expect(avisos.some((a) => a.title.includes('apagada pelo gerente') && a.body.includes('remarquei'))).toBe(true);
  });
});

describe('hoje na rede e relatório da rede', () => {
  it('quem está fora hoje, por unidade, e a unidade sem gerente no topo', async () => {
    const { getHojeNaRede } = await import('@/lib/manager-schedule-rede');
    await prisma.managerLeave.createMany({
      data: [
        { userId: anaId, kind: 'FERIAS', startDate: '2026-10-01', endDate: '2026-10-20', createdById: supId },
        { userId: brunoId, kind: 'FOLGA', startDate: HOJE, endDate: HOJE, createdById: brunoId },
        { userId: carlaId, kind: 'FOLGA', startDate: '2026-10-17', endDate: '2026-10-17', createdById: supId },
        /* excluída: não conta */
        { userId: brunoId, kind: 'FOLGA', startDate: '2026-10-16', endDate: '2026-10-16', createdById: supId, deletedAt: new Date(), deletedById: supId, deleteReason: 'lançada por engano no dia 16' },
      ],
    });
    const hoje = await getHojeNaRede(admin(), HOJE);
    const centro = hoje.unidades.find((x) => x.unitId === unitA)!;
    const orla = hoje.unidades.find((x) => x.unitId === unitB)!;
    expect(hoje.unidades[0].unitId).toBe(unitA); // sem gerente primeiro
    expect(centro.semGerente).toBe(true);
    expect(centro.linhas.find((l) => l.userId === anaId)?.situacao).toBe('FERIAS');
    expect(centro.linhas.find((l) => l.userId === brunoId)?.situacao).toBe('FOLGA');
    expect(centro.linhas.find((l) => l.userId === brunoId)?.voltaAmanha).toBe(true);
    expect(centro.linhas.find((l) => l.userId === brunoId)?.lancadoPor).toBe('o próprio gerente');
    expect(orla.semHorario).toBe(true);
    expect(hoje.resumo.deFerias).toBeGreaterThanOrEqual(1);
    expect(hoje.resumo.deFolga).toBeGreaterThanOrEqual(1);
    /* próximos 7 dias: Carla no 17; o dia 16 do Bruno foi excluído */
    expect(hoje.proximos.some((p) => p.name === 'Carla' && p.iso === '2026-10-17')).toBe(true);
    expect(hoje.proximos.some((p) => p.name === 'Bruno' && p.iso === '2026-10-16')).toBe(false);

    /* escopo: a Supervisão da A não vê a Orla */
    const daSup = await getHojeNaRede(sup(), HOJE);
    expect(daSup.unidades.some((x) => x.unitId === unitB)).toBe(false);
  });

  it('o relatório é só do Admin, nomeia quem está sem folga e lista as exclusões com motivo', async () => {
    const { getRelatorioDaRede } = await import('@/lib/manager-schedule-rede');
    await prisma.managerLeave.createMany({
      data: [
        { userId: anaId, kind: 'FERIAS', startDate: '2026-09-25', endDate: '2026-10-05', createdById: supId },
        { userId: brunoId, kind: 'FOLGA', startDate: '2026-10-16', endDate: '2026-10-16', createdById: supId, deletedAt: new Date(), deletedById: supId, deleteReason: 'lançada por engano no dia 16' },
      ],
    });
    expect(await getRelatorioDaRede(sup(), 2026, 10)).toBeNull();
    const rel = await getRelatorioDaRede(admin(), 2026, 10);
    expect(rel).not.toBeNull();
    const centro = rel!.unidades.find((x) => x.unitId === unitA)!;
    const anaRel = centro.gerentes.find((g) => g.userId === anaId)!;
    expect(anaRel.semFolga).toBe(false);
    expect(anaRel.diasDeFerias).toBe(5); // só os dias de outubro
    expect(centro.gerentes.find((g) => g.userId === brunoId)?.semFolga).toBe(true); // a dele foi excluída
    expect(rel!.exclusoes.some((e) => e.managerName === 'Bruno' && e.motivo === 'lançada por engano no dia 16' && e.apagadoPor === 'Sup')).toBe(true);
    expect(rel!.resumo.semFolga).toBeGreaterThanOrEqual(2); // Bruno e Carla
  });
});

describe('a meta desconta por gerente sem folga cadastrada', () => {
  it('conta os gerentes da unidade sem lançamento ativo no mês, com os nomes; excluída não conta', async () => {
    const { getManagerLeaveMetaStats } = await import('@/lib/metas/escala-gerentes');
    await prisma.managerLeave.createMany({
      data: [
        { userId: anaId, kind: 'FOLGA', startDate: '2026-10-20', endDate: '2026-10-20', createdById: anaId },
        { userId: brunoId, kind: 'FOLGA', startDate: '2026-10-16', endDate: '2026-10-16', createdById: supId, deletedAt: new Date(), deletedById: supId, deleteReason: 'lançada por engano no dia 16' },
      ],
    });
    const s = await getManagerLeaveMetaStats(unitA, '2026-10');
    expect(s.gerentes).toBe(2);
    expect(s.semFolga).toBe(1);
    expect(s.nomesSemFolga).toEqual(['Bruno']);
    /* outubro sem nada: os dois descontam */
    expect((await getManagerLeaveMetaStats(unitA, '2026-11')).semFolga).toBe(2);
  });

  it('entra na nota: 2 gerentes sem folga × 5% = −10 pontos (o padrão é 5)', async () => {
    const { getUnitMonthScore } = await import('@/lib/tasks/summary');
    const { getMetaBreakdown } = await import('@/lib/metas/query');
    const { getManagerLeaveMetaPenalty } = await import('@/lib/metas/config');
    /* unidade nova sem tarefa nenhuma: nota base 0 → max(0, 0 − 10) = 0; para
       medir o desconto a base precisa ser > 0, então damos um checklist feito. */
    const tpl = await prisma.taskTemplate.create({ data: { name: `Meta ${sfx}`, unitId: unitA, entersMeta: true, weight: 10 } });
    await prisma.taskInstance.create({ data: { templateId: tpl.id, unitId: unitA, operationalDate: '2026-11-03', status: 'DONE', dueAt: new Date('2026-11-03T13:00:00Z') } });
    const pct = await getManagerLeaveMetaPenalty();
    expect(pct).toBe(5);
    const score = await getUnitMonthScore(unitA, '2026-11');
    expect(score.scorePct).toBe(100 - 2 * pct);
    const linhas = await getMetaBreakdown(unitA, '2026-11');
    const linha = linhas.find((l) => l.name.startsWith('Escala de gerentes'));
    expect(linha?.name).toContain('Ana');
    expect(linha?.name).toContain('Bruno');
    expect(linha?.name).toContain('−10% na meta');
    await prisma.taskInstance.deleteMany({ where: { templateId: tpl.id } });
    await prisma.taskTemplate.delete({ where: { id: tpl.id } });
  });
});
