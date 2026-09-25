import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { format, addDays } from 'date-fns';
import { currentOperationalDate } from '@/lib/date/operational';
import { garantirTokenPublico } from '@/lib/pizzas/acesso';
import { salvarFechamento, salvarFechamentoSessao, portaDeFechamento, fechamentoDoDia } from '@/lib/pizzas/fechamento';
import { totalGeral, type ContagensDoFechamento } from '@/lib/pizzas/tipos';
import type { SessionUser } from '@/lib/auth/session';

/**
 * CORREÇÃO DO FECHAMENTO PELO SUPERVISOR (autenticada).
 *
 * A porta que faltava: o fechamento é lançado sem login pela pizzaria, e um erro
 * do funcionário só se corrigia pelo próprio link. Aqui o supervisor audita e
 * corrige de dentro do SGO — qualquer dia até hoje, e corrigir um dia que já
 * tem fechamento EXIGE motivo (fica na Auditoria com o autor).
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let outraUnit: string;
let supId: string;
let gerId: string;
let caixaId: string;
let outroGerId: string;
let token: string;
let hoje: string;

const conta = (t35: number, t30: number, t25: number, i35: number, i30: number, i25: number): ContagensDoFechamento => ({
  TEKNISA: { CM35: t35, CM30: t30, CM25: t25 },
  IFOOD: { CM35: i35, CM30: i30, CM25: i25 },
});

const supervisor = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const gerente = (): SessionUser => ({ id: gerId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const caixa = (): SessionUser => ({ id: caixaId, name: 'Caixa', role: 'CASHIER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const gerenteDeOutra = (): SessionUser => ({ id: outroGerId, name: 'Outro', role: 'MANAGER', unitIds: [outraUnit], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const u = await prisma.unit.create({ data: { code: `PZS-${sfx}`, name: `Pizzaria ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, hasPizzeria: true } });
  unitId = u.id;
  outraUnit = (await prisma.unit.create({ data: { code: `PZO-${sfx}`, name: `Outra ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, hasPizzeria: true } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `pzs-sup-${sfx}@t.local`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  gerId = (await prisma.user.create({ data: { name: 'Ger', email: `pzs-ger-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  caixaId = (await prisma.user.create({ data: { name: 'Caixa', email: `pzs-cx-${sfx}@t.local`, role: 'CASHIER', passwordHash: 'x' } })).id;
  outroGerId = (await prisma.user.create({ data: { name: 'Outro', email: `pzs-og-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  token = await garantirTokenPublico(unitId);
  hoje = currentOperationalDate({ timezone: u.timezone, cutoffHour: u.cutoffHour });
});

beforeEach(async () => {
  await prisma.pizzaClosing.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } });
});

afterAll(async () => {
  await prisma.pizzaClosing.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnit] } } });
  await prisma.user.deleteMany({ where: { id: { in: [supId, gerId, caixaId, outroGerId] } } });
  await prisma.$disconnect();
});

describe('quem pode', () => {
  it('supervisor com acesso passa; caixa e gerente de outra unidade não', async () => {
    expect(await portaDeFechamento(supervisor(), unitId)).not.toBeNull();
    expect(await portaDeFechamento(gerente(), unitId)).not.toBeNull();
    expect(await portaDeFechamento(caixa(), unitId)).toBeNull();          // perfil sem correção
    expect(await portaDeFechamento(gerenteDeOutra(), unitId)).toBeNull(); // fora do escopo
  });

  it('caixa é recusado com FORBIDDEN ao tentar salvar', async () => {
    const r = await salvarFechamentoSessao(caixa(), { unitId, operationalDate: hoje, contagens: conta(1, 0, 0, 0, 0, 0) });
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });
});

describe('criar e corrigir', () => {
  it('cria um fechamento onde não havia — sem exigir motivo — e grava o autor', async () => {
    const r = await salvarFechamentoSessao(supervisor(), { unitId, operationalDate: hoje, contagens: conta(10, 5, 3, 4, 2, 1) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.substituiu).toBe(false);
    expect(r.total).toBe(25);
    const salvo = await prisma.pizzaClosing.findUnique({ where: { unitId_operationalDate: { unitId, operationalDate: hoje } }, select: { createdById: true } });
    expect(salvo?.createdById).toBe(supId);
    const dia = await fechamentoDoDia(unitId, hoje);
    expect(dia!.contagens).toEqual(conta(10, 5, 3, 4, 2, 1));
  });

  it('corrigir um dia que já existe SEM motivo é recusado (MOTIVO)', async () => {
    await salvarFechamento({ token, contagens: conta(10, 5, 3, 4, 2, 1) }); // lançado pelo link (funcionário)
    const r = await salvarFechamentoSessao(supervisor(), { unitId, operationalDate: hoje, contagens: conta(4, 2, 1, 10, 5, 3) });
    expect(r).toEqual({ ok: false, reason: 'MOTIVO' });
  });

  it('corrigir com motivo aplica a nova contagem, preserva o autor original e audita com origem supervisor', async () => {
    await salvarFechamento({ token, contagens: conta(10, 5, 3, 4, 2, 1) }); // link: createdById nulo
    const r = await salvarFechamentoSessao(supervisor(), {
      unitId, operationalDate: hoje,
      contagens: conta(4, 2, 1, 10, 5, 3),
      motivo: 'funcionário lançou o iFood no Teknisa',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.substituiu).toBe(true);

    const dia = await fechamentoDoDia(unitId, hoje);
    expect(dia!.contagens).toEqual(conta(4, 2, 1, 10, 5, 3));
    const salvo = await prisma.pizzaClosing.findUnique({ where: { unitId_operationalDate: { unitId, operationalDate: hoje } }, select: { createdById: true } });
    expect(salvo?.createdById).toBeNull(); // autor do link preservado, não sobrescrito

    const log = await prisma.auditLog.findFirst({
      where: { entity: 'pizza_closing', action: 'PIZZA_CLOSING_UPDATE', userId: supId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    const meta = log!.metadata as Record<string, unknown>;
    expect(meta.origem).toBe('supervisor');
    expect(meta.motivo).toBe('funcionário lançou o iFood no Teknisa');
    expect(meta.total).toBe(25);
  });
});

describe('as recusas', () => {
  it('data futura é DATA', async () => {
    const amanha = format(addDays(new Date(`${hoje}T12:00:00`), 1), 'yyyy-MM-dd');
    const r = await salvarFechamentoSessao(supervisor(), { unitId, operationalDate: amanha, contagens: conta(1, 0, 0, 0, 0, 0) });
    expect(r).toEqual({ ok: false, reason: 'DATA' });
  });

  it('as seis em zero é VAZIO', async () => {
    const r = await salvarFechamentoSessao(supervisor(), { unitId, operationalDate: hoje, contagens: conta(0, 0, 0, 0, 0, 0) });
    expect(r).toEqual({ ok: false, reason: 'VAZIO' });
  });

  it('quantidade inválida (negativa) é QUANTIDADES', async () => {
    const r = await salvarFechamentoSessao(supervisor(), { unitId, operationalDate: hoje, contagens: conta(-1, 0, 0, 0, 0, 0) });
    expect(r).toEqual({ ok: false, reason: 'QUANTIDADES' });
  });

  it('supervisor NÃO precisa de motivo para criar num dia sem fechamento', async () => {
    const ontem = format(addDays(new Date(`${hoje}T12:00:00`), -1), 'yyyy-MM-dd');
    const r = await salvarFechamentoSessao(supervisor(), { unitId, operationalDate: ontem, contagens: conta(2, 0, 0, 0, 0, 0) });
    expect(r.ok).toBe(true);
  });
});
