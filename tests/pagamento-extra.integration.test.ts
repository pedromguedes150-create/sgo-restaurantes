import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { fecharCompetencia, getQuadroDaCompetencia, lancarEmLote, reabrirCompetencia, registrarEntrega } from '@/lib/people/payouts-competencia';
import type { SessionUser } from '@/lib/auth/session';
import type { PaymentStatus } from '@prisma/client';

/**
 * PAGAMENTO EXTRA, do banco até o quadro.
 *
 * O que se prova: que a hora extra aprovada em Pagamentos APARECE na
 * competência do MÊS SEGUINTE sem ninguém copiar nada; que pendente e
 * rejeitada ficam de fora; que finalizar marca as HE como PAGAS; e que uma HE
 * aprovada depois do fechamento não muda o arquivo em silêncio.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const COMP = '2026-10'; // paga as horas de setembro/2026
let unidadeA: string;
let unidadeB: string;
let adminId: string;
let gerenteId: string;
let ana: string;
let bruno: string;

/* Admin e Financeiro RECORTADOS às unidades do teste (`seesAllUnits: false`):
   o fechamento marca como PAGA toda HE aprovada no escopo, e um Admin de
   verdade aqui pagaria as horas extras que os OUTROS arquivos de teste criaram
   no mesmo mês — falha intermitente no arquivo errado. O que se prova não
   depende de ver a rede toda. */
const admin = (): SessionUser => ({ id: adminId, name: 'Admin PE', role: 'ADMIN', unitIds: [unidadeA, unidadeB], seesAllUnits: false, needsTerms: false });
const financeiro = (): SessionUser => ({ id: adminId, name: 'Fin', role: 'FINANCE', unitIds: [unidadeA, unidadeB], seesAllUnits: false, needsTerms: false });
const supervisor = (): SessionUser => ({ id: adminId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unidadeA], seesAllUnits: false, needsTerms: false });

async function he(over: { unitId?: string; collaboratorId?: string | null; nome?: string; dia?: string; status?: PaymentStatus; amount?: number; hours?: number }) {
  return prisma.paymentRequest.create({
    data: {
      type: 'OVERTIME',
      unitId: over.unitId ?? unidadeA,
      status: over.status ?? 'APPROVED',
      amount: over.amount ?? 45,
      hours: over.hours ?? 3,
      hourlyRate: 15,
      workDate: new Date(`${over.dia ?? '2026-09-15'}T12:00:00Z`),
      workStartTime: '18:00', workEndTime: '21:00',
      collaboratorId: over.collaboratorId === undefined ? ana : over.collaboratorId,
      collaboratorName: over.nome ?? `PE-${sfx} Ana`,
      requestedById: gerenteId,
      approvedById: (over.status ?? 'APPROVED') === 'PENDING' ? null : adminId,
      approvedAt: (over.status ?? 'APPROVED') === 'PENDING' ? null : new Date('2026-09-16T10:00:00Z'),
    },
  });
}

const soMinhas = (q: Awaited<ReturnType<typeof getQuadroDaCompetencia>>) => ({ ...q, grupos: q.grupos.filter((g) => [unidadeA, unidadeB].includes(g.unitId)) });

beforeAll(async () => {
  unidadeA = (await prisma.unit.create({ data: { code: `PEA-${sfx}`, name: `PE A ${sfx}` } })).id;
  unidadeB = (await prisma.unit.create({ data: { code: `PEB-${sfx}`, name: `PE B ${sfx}` } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin PE', email: `pe-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Ger PE', email: `pe-ger-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  ana = (await prisma.collaborator.create({ data: { name: `PE-${sfx} Ana`, cpf: '09494305604', hireDate: '2026-08-20', units: { create: { unitId: unidadeA } } } })).id;
  bruno = (await prisma.collaborator.create({ data: { name: `PE-${sfx} Bruno`, cpf: '13849372693', units: { create: { unitId: unidadeB } } } })).id;
});

beforeEach(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB] } } });
  await prisma.payoutDelivery.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB] } } });
  await prisma.payoutClosure.deleteMany({ where: { yearMonth: COMP, type: 'EXTRA' } });
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB] } } });
  await prisma.payoutDelivery.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB] } } });
  await prisma.payoutClosure.deleteMany({ where: { yearMonth: COMP, type: 'EXTRA' } });
  await prisma.notification.deleteMany({ where: { userId: gerenteId } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { name: { startsWith: `PE-${sfx}` } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unidadeA, unidadeB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, gerenteId] } } });
  await prisma.$disconnect();
});

describe('A hora extra aprovada aparece na competência do MÊS SEGUINTE', () => {
  it('trabalhou em 15/09 → está em outubro, e NÃO em setembro', async () => {
    await he({ dia: '2026-09-15' });
    const out = soMinhas(await getQuadroDaCompetencia(admin(), '2026-10', 'EXTRA'));
    expect(out.totalLancamentos).toBe(1);
    expect(out.totalGeral).toBe(45);
    expect(out.extra?.mesTrabalhado).toBe('2026-09');
    const set = soMinhas(await getQuadroDaCompetencia(admin(), '2026-09', 'EXTRA'));
    expect(set.grupos).toHaveLength(0);
  });

  it('sem copiar nada: nenhuma linha em collaborator_payouts', async () => {
    await he({});
    await getQuadroDaCompetencia(admin(), COMP, 'EXTRA');
    expect(await prisma.collaboratorPayout.count({ where: { type: 'EXTRA' } })).toBe(0);
  });

  it('pendente fica FORA do total (só contada no aviso); rejeitada some', async () => {
    await he({ status: 'APPROVED', amount: 45 });
    await he({ status: 'PENDING', amount: 30, dia: '2026-09-20' });
    await he({ status: 'REJECTED', amount: 99, dia: '2026-09-21' });
    const q = soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA'));
    expect(q.totalGeral).toBe(45);
    expect(q.totalLancamentos).toBe(1);
    expect(q.extra?.pendentes).toEqual({ qtd: 1, valor: 30 });
  });

  it('já PAGA (pela aba Pagar) também entra — foi trabalhada no mês', async () => {
    await he({ status: 'PAID', amount: 45 });
    await he({ status: 'APPROVED', amount: 30, dia: '2026-09-20' });
    const q = soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA'));
    expect(q.totalGeral).toBe(75);
    expect(q.grupos[0].lancamentos[0].status).toBe('MISTO');
  });

  it('duas HE da mesma pessoa = UMA linha, com a soma e o detalhe das duas; CPF do cadastro', async () => {
    await he({ dia: '2026-09-10', amount: 45, hours: 3 });
    await he({ dia: '2026-09-12', amount: 22.5, hours: 1.5 });
    const q = soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA'));
    expect(q.grupos[0].lancamentos).toHaveLength(1);
    const l = q.grupos[0].lancamentos[0];
    expect(l.valor).toBe(67.5);
    expect(l.horas).toBe(4.5);
    expect(l.horasExtras).toHaveLength(2);
    expect(l.cpf).toBe('09494305604');
    expect(l.admissaoEm).toBe('2026-08-20');
    expect(q.extra?.colaboradores).toBe(1);
  });

  it('respeita o escopo de unidade e aponta quem ainda não tem HE', async () => {
    await he({ unitId: unidadeA });
    await he({ unitId: unidadeB, collaboratorId: bruno, nome: `PE-${sfx} Bruno` });
    const sup = await getQuadroDaCompetencia(supervisor(), COMP, 'EXTRA');
    expect(sup.grupos.map((g) => g.unitId)).toEqual([unidadeA]);
    expect(sup.unidadesSemLancamento.map((u) => u.id)).not.toContain(unidadeA);
    const adm = soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA'));
    expect(adm.grupos).toHaveLength(2);
  });

  it('não há lançamento manual de Pagamento Extra', async () => {
    const r = await lancarEmLote(admin(), { competencia: COMP, tipo: 'EXTRA', itens: [{ collaboratorId: ana, amount: 100 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('a entrega por unidade funciona como na Mobilidade, e é por tipo', async () => {
    await he({});
    await registrarEntrega(admin(), { unitId: unidadeA, competencia: COMP, tipo: 'EXTRA', entregaEm: '2026-10-05' });
    expect(soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA')).grupos[0].entregaEm).toBe('2026-10-05');
    expect(await prisma.payoutDelivery.count({ where: { unitId: unidadeA, yearMonth: COMP, type: 'MOBILITY' } })).toBe(0);
  });
});

describe('Finalizar a competência marca as horas extras como PAGAS', () => {
  it('só Admin/CEO/Financeiro fecham — o Supervisor não, mesmo fechando Mobilidade', async () => {
    await he({});
    const r = await fecharCompetencia(supervisor(), COMP, 'EXTRA');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
    expect(await prisma.paymentRequest.count({ where: { unitId: unidadeA, status: 'APPROVED' } })).toBe(1);
  });

  it('fechar: as aprovadas viram PAID com quem fechou; a competência fica fechada', async () => {
    const a = await he({ dia: '2026-09-10' });
    const b = await he({ dia: '2026-09-12', status: 'PENDING' });
    const r = await fecharCompetencia(financeiro(), COMP, 'EXTRA');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gravados).toBe(1);
    const pa = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: a.id } });
    expect(pa.status).toBe('PAID');
    expect(pa.paidById).toBe(adminId);
    expect(pa.paidAt).not.toBeNull();
    /* Pendente NÃO é paga pelo fechamento: só o que estava aprovado. */
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('PENDING');
    const q = soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA'));
    expect(q.fechada).toBe(true);
    expect(q.totalGeral).toBe(45);
    expect(q.grupos[0].lancamentos[0].status).toBe('PAID');
  });

  it('fica na Auditoria: o fechamento e cada HE paga', async () => {
    const a = await he({});
    await fecharCompetencia(admin(), COMP, 'EXTRA');
    const paga = await prisma.auditLog.findFirst({ where: { action: 'PAYMENT_PAID', entityId: a.id }, orderBy: { createdAt: 'desc' } });
    expect(paga).not.toBeNull();
    expect((paga?.metadata as { via?: string })?.via).toBe('PAGAMENTO_EXTRA');
  });

  it('HE aprovada DEPOIS do fechamento vai para o bloco à parte, fora do total; reabrir e fechar de novo a inclui', async () => {
    const antes = await he({ dia: '2026-09-10', amount: 45 });
    await fecharCompetencia(admin(), COMP, 'EXTRA');
    const depois = await he({ dia: '2026-09-20', amount: 30 });

    const q1 = soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA'));
    expect(q1.totalGeral).toBe(45);
    expect(q1.extra?.aposFechamento.qtd).toBe(1);
    expect(q1.extra?.aposFechamento.valor).toBe(30);
    expect(q1.extra?.aposFechamento.linhas[0].id).toBe(depois.id);

    /* Reabrir NÃO desfaz o pago. */
    expect((await reabrirCompetencia(admin(), COMP, 'EXTRA')).ok).toBe(true);
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: antes.id } })).status).toBe('PAID');
    const q2 = soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA'));
    expect(q2.fechada).toBe(false);
    expect(q2.totalGeral).toBe(75);

    const r = await fecharCompetencia(admin(), COMP, 'EXTRA');
    if (r.ok) expect(r.gravados).toBe(1);
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: depois.id } })).status).toBe('PAID');
    const q3 = soMinhas(await getQuadroDaCompetencia(admin(), COMP, 'EXTRA'));
    expect(q3.totalGeral).toBe(75);
    expect(q3.extra?.aposFechamento.qtd).toBe(0);
  });

  it('fechar o Pagamento Extra NÃO fecha a Mobilidade', async () => {
    await he({});
    await fecharCompetencia(admin(), COMP, 'EXTRA');
    expect((await getQuadroDaCompetencia(admin(), COMP, 'MOBILITY')).fechada).toBe(false);
  });
});
