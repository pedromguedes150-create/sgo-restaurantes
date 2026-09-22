import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  editarLancamento, excluirLancamento, fecharCompetencia, getQuadroDaCompetencia,
  lancarEmLote, reabrirCompetencia, registrarEntrega,
} from '@/lib/people/payouts-competencia';
import type { SessionUser } from '@/lib/auth/session';

/**
 * COMISSÃO E MOBILIDADE, do banco até o quadro.
 *
 * O que se prova aqui: que as duas modalidades são INDEPENDENTES em tudo
 * (fechar uma não trava a outra), que o fechamento realmente protege, e que
 * CPF e unidade saem do CADASTRO — não de uma cópia no lançamento, que
 * envelheceria.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const COMP = '2026-09';
let unidadeA: string;
let unidadeB: string;
let fora: string;
let userId: string;
let ana: string;
let bruno: string;
let deOutra: string;

const admin = (): SessionUser => ({ id: userId, name: 'Admin Payout', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const supervisor = (): SessionUser => ({ id: userId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unidadeA, unidadeB], seesAllUnits: false, needsTerms: false });
const gerente = (): SessionUser => ({ id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [unidadeA], seesAllUnits: false, needsTerms: false });

async function colaborador(nome: string, unitId: string, over: { cpf?: string; hireDate?: string } = {}) {
  const c = await prisma.collaborator.create({
    data: { name: `PAY-${sfx} ${nome}`, cpf: over.cpf ?? null, hireDate: over.hireDate ?? null, units: { create: { unitId } } },
  });
  return c.id;
}

beforeAll(async () => {
  unidadeA = (await prisma.unit.create({ data: { code: `PA-${sfx}`, name: `Payout A ${sfx}` } })).id;
  unidadeB = (await prisma.unit.create({ data: { code: `PB-${sfx}`, name: `Payout B ${sfx}` } })).id;
  fora = (await prisma.unit.create({ data: { code: `PF-${sfx}`, name: `Payout Fora ${sfx}` } })).id;
  userId = (await prisma.user.create({ data: { name: 'Admin Payout', email: `pay-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  ana = await colaborador('Ana', unidadeA, { cpf: '09494305604', hireDate: '2026-08-20' });
  bruno = await colaborador('Bruno', unidadeA, { cpf: '13849372693', hireDate: '2019-03-01' });
  deOutra = await colaborador('Fora do alcance', fora);
});

beforeEach(async () => {
  await prisma.collaboratorPayout.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB, fora] } } });
  await prisma.payoutDelivery.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB, fora] } } });
  await prisma.payoutClosure.deleteMany({ where: { yearMonth: COMP } });
});

afterAll(async () => {
  await prisma.collaboratorPayout.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB, fora] } } });
  await prisma.payoutDelivery.deleteMany({ where: { unitId: { in: [unidadeA, unidadeB, fora] } } });
  await prisma.payoutClosure.deleteMany({ where: { yearMonth: COMP } });
  await prisma.collaborator.deleteMany({ where: { name: { startsWith: `PAY-${sfx}` } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unidadeA, unidadeB, fora] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const meusGrupos = async (tipo: 'COMMISSION' | 'MOBILITY', quem = admin()) => {
  const q = await getQuadroDaCompetencia(quem, COMP, tipo);
  return { ...q, grupos: q.grupos.filter((g) => [unidadeA, unidadeB].includes(g.unitId)) };
};

describe('Lançamento em lote', () => {
  it('grava vários e devolve a contagem', async () => {
    const r = await lancarEmLote(admin(), {
      competencia: COMP, tipo: 'MOBILITY',
      itens: [{ collaboratorId: ana, amount: 150 }, { collaboratorId: bruno, amount: 250 }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gravados).toBe(2);
  });

  it('a UNIDADE sai do cadastro, nunca do corpo da requisição', async () => {
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }] });
    const q = await meusGrupos('MOBILITY');
    expect(q.grupos).toHaveLength(1);
    expect(q.grupos[0].unitId).toBe(unidadeA);
  });

  it('ignora quem está fora do alcance de quem lança, e continua com o resto', async () => {
    const r = await lancarEmLote(supervisor(), {
      competencia: COMP, tipo: 'MOBILITY',
      itens: [{ collaboratorId: ana, amount: 150 }, { collaboratorId: deOutra, amount: 999 }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gravados).toBe(1);
    const q = await getQuadroDaCompetencia(admin(), COMP, 'MOBILITY');
    expect(q.grupos.some((g) => g.unitId === fora)).toBe(false);
  });

  it('valor zero ou negativo não entra', async () => {
    const r = await lancarEmLote(admin(), {
      competencia: COMP, tipo: 'MOBILITY',
      itens: [{ collaboratorId: ana, amount: 0 }, { collaboratorId: bruno, amount: -5 }],
    });
    expect(r.ok).toBe(false);
  });

  it('gerente não lança', async () => {
    const r = await lancarEmLote(gerente(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});

describe('As duas modalidades são independentes', () => {
  beforeEach(async () => {
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }] });
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'COMMISSION', itens: [{ collaboratorId: ana, amount: 900 }] });
  });

  it('o quadro de uma NÃO traz o lançamento da outra', async () => {
    /* É a separação que o pedido exige, e ela começa aqui: se vazasse no
       quadro, vazaria no Excel. */
    const mob = await meusGrupos('MOBILITY');
    const com = await meusGrupos('COMMISSION');
    expect(mob.totalGeral).toBe(150);
    expect(com.totalGeral).toBe(900);
  });

  it('fechar a comissão NÃO trava a mobilidade', async () => {
    /* Elas seguem para a administradora em arquivos e momentos diferentes. */
    await fecharCompetencia(admin(), COMP, 'COMMISSION');
    expect((await meusGrupos('COMMISSION')).fechada).toBe(true);
    expect((await meusGrupos('MOBILITY')).fechada).toBe(false);

    const r = await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: bruno, amount: 200 }] });
    expect(r.ok).toBe(true);
  });

  it('a ENTREGA também é por modalidade', async () => {
    await registrarEntrega(admin(), { unitId: unidadeA, competencia: COMP, tipo: 'MOBILITY', entregaEm: '2026-08-26' });
    expect((await meusGrupos('MOBILITY')).grupos[0].entregaEm).toBe('2026-08-26');
    expect((await meusGrupos('COMMISSION')).grupos[0].entregaEm).toBeNull();
  });
});

describe('O fechamento protege de verdade', () => {
  let lancamento: string;
  beforeEach(async () => {
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }] });
    lancamento = (await prisma.collaboratorPayout.findFirstOrThrow({ where: { unitId: unidadeA, type: 'MOBILITY' } })).id;
    await fecharCompetencia(admin(), COMP, 'MOBILITY');
  });

  it('não lança, não edita, não exclui e não muda a entrega', async () => {
    for (const r of [
      await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: bruno, amount: 10 }] }),
      await editarLancamento(admin(), lancamento, { amount: 999 }),
      await excluirLancamento(admin(), lancamento),
      await registrarEntrega(admin(), { unitId: unidadeA, competencia: COMP, tipo: 'MOBILITY', entregaEm: '2026-09-01' }),
    ]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('FECHADA');
    }
  });

  it('só o Admin reabre', async () => {
    const naoPode = await reabrirCompetencia(supervisor(), COMP, 'MOBILITY');
    expect(naoPode.ok).toBe(false);
    const pode = await reabrirCompetencia(admin(), COMP, 'MOBILITY');
    expect(pode.ok).toBe(true);
    expect((await meusGrupos('MOBILITY')).fechada).toBe(false);
  });

  it('reaberta, volta a aceitar edição', async () => {
    await reabrirCompetencia(admin(), COMP, 'MOBILITY');
    expect((await editarLancamento(admin(), lancamento, { amount: 200 })).ok).toBe(true);
  });
});

describe('CPF e admissão vêm do CADASTRO, não de uma cópia', () => {
  it('corrigir o cadastro muda o que a tela e o Excel mostram', async () => {
    /* Se fossem copiados para o lançamento, a correção feita no RH nunca
       chegaria ao arquivo — e ninguém ligaria uma coisa à outra. */
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }] });
    expect((await meusGrupos('MOBILITY')).grupos[0].lancamentos[0].cpf).toBe('09494305604');

    await prisma.collaborator.update({ where: { id: ana }, data: { cpf: '11122233344' } });
    expect((await meusGrupos('MOBILITY')).grupos[0].lancamentos[0].cpf).toBe('11122233344');
  });

  it('traz a admissão, que é o que decide "Novato" no arquivo', async () => {
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }] });
    expect((await meusGrupos('MOBILITY')).grupos[0].lancamentos[0].admissaoEm).toBe('2026-08-20');
  });
});

describe('O quadro agrupado', () => {
  it('soma por unidade e no geral', async () => {
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }, { collaboratorId: bruno, amount: 250 }] });
    const q = await meusGrupos('MOBILITY');
    expect(q.grupos[0].total).toBe(400);
    expect(q.totalGeral).toBe(400);
    expect(q.totalLancamentos).toBeGreaterThanOrEqual(2);
  });

  it('aponta as unidades do escopo SEM lançamento', async () => {
    /* Sem esta lista, uma unidade esquecida só aparece quando a administradora
       reclama. */
    await lancarEmLote(supervisor(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }] });
    const q = await getQuadroDaCompetencia(supervisor(), COMP, 'MOBILITY');
    expect(q.unidadesSemLancamento.map((u) => u.id)).toContain(unidadeB);
    expect(q.unidadesSemLancamento.map((u) => u.id)).not.toContain(unidadeA);
  });

  it('respeita o escopo de unidade', async () => {
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: deOutra, amount: 300 }] });
    const q = await getQuadroDaCompetencia(supervisor(), COMP, 'MOBILITY');
    expect(q.grupos.some((g) => g.unitId === fora)).toBe(false);
  });
});

describe('Data de entrega', () => {
  beforeEach(async () => {
    await lancarEmLote(admin(), { competencia: COMP, tipo: 'MOBILITY', itens: [{ collaboratorId: ana, amount: 150 }] });
  });

  it('uma data por unidade, herdada por todos os lançamentos dela', async () => {
    await registrarEntrega(admin(), { unitId: unidadeA, competencia: COMP, tipo: 'MOBILITY', entregaEm: '2026-08-26' });
    expect((await meusGrupos('MOBILITY')).grupos[0].entregaEm).toBe('2026-08-26');
  });

  it('data vazia APAGA o registro, em vez de deixar uma data errada', async () => {
    /* Data errada gravada mandaria "entregue" no arquivo da administradora. */
    await registrarEntrega(admin(), { unitId: unidadeA, competencia: COMP, tipo: 'MOBILITY', entregaEm: '2026-08-26' });
    await registrarEntrega(admin(), { unitId: unidadeA, competencia: COMP, tipo: 'MOBILITY', entregaEm: null });
    expect((await meusGrupos('MOBILITY')).grupos[0].entregaEm).toBeNull();
  });

  it('regravar substitui, e não duplica', async () => {
    await registrarEntrega(admin(), { unitId: unidadeA, competencia: COMP, tipo: 'MOBILITY', entregaEm: '2026-08-26' });
    await registrarEntrega(admin(), { unitId: unidadeA, competencia: COMP, tipo: 'MOBILITY', entregaEm: '2026-08-28' });
    expect(await prisma.payoutDelivery.count({ where: { unitId: unidadeA, yearMonth: COMP, type: 'MOBILITY' } })).toBe(1);
    expect((await meusGrupos('MOBILITY')).grupos[0].entregaEm).toBe('2026-08-28');
  });

  it('quem não alcança a unidade não registra entrega nela', async () => {
    const r = await registrarEntrega(gerente(), { unitId: unidadeB, competencia: COMP, tipo: 'MOBILITY', entregaEm: '2026-08-26' });
    expect(r.ok).toBe(false);
  });
});
