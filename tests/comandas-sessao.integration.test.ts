import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  iniciarConferencia, marcarComanda, getSessao, sessaoEmAndamento,
  finalizarConferencia, cancelarConferencia, listarConferencias, detalheDaConferencia,
} from '@/lib/commands/sessao';
import type { SessionUser } from '@/lib/auth/session';

/**
 * SESSÃO DE CONFERÊNCIA de comandas.
 *
 * O defeito de origem: havia UMA contagem por unidade por dia, e começar outra
 * sobrescrevia a anterior — a tela chegava a avisar *"as marcas são da contagem
 * de 03/09, não de hoje"*. Não havia histórico, e a grade reabria com marcas de
 * outro dia.
 *
 * O que se prova aqui, em ordem de importância:
 * 1. conferência concluída **nunca** é sobrescrita nem alterada;
 * 2. conferência nova **não herda** marcas da anterior;
 * 3. comanda não localizada vira **apuração**, nunca "perdida";
 * 4. leitura repetida não conta duas vezes.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let userId: string;

const user = (): SessionUser => ({ id: userId, name: 'Caixa', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const u = await prisma.unit.create({
    data: { code: `CS-${sfx}`, name: 'Unidade Comandas', timezone: 'America/Sao_Paulo', cutoffHour: 4 },
  });
  unitId = u.id;
  const us = await prisma.user.create({
    data: { name: 'Caixa Teste', email: `cs-${sfx}@teste.local`, role: 'MANAGER', passwordHash: 'x' },
  });
  userId = us.id;
  await prisma.unitMembership.create({ data: { userId, unitId } });
  /* Faixa 1..10: pequena de propósito, para os casos ficarem legíveis. */
  await prisma.commandSequence.create({
    data: { unitId, name: 'Principal', rangeStart: 1, rangeEnd: 10, active: true },
  });
});

beforeEach(async () => {
  await prisma.commandCountSession.deleteMany({ where: { unitId } });
  await prisma.commandDivergence.deleteMany({ where: { unitId } });
  await prisma.commandCount.deleteMany({ where: { unitId } });
});

afterAll(async () => {
  await prisma.commandCountSession.deleteMany({ where: { unitId } });
  await prisma.commandDivergence.deleteMany({ where: { unitId } });
  await prisma.commandCount.deleteMany({ where: { unitId } });
  await prisma.commandSequence.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unitMembership.deleteMany({ where: { userId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

async function abrirCompleta() {
  const r = await iniciarConferencia(user(), { unitId, type: 'COMPLETA', method: 'MANUAL' });
  if (!r.ok) throw new Error(`não abriu: ${r.reason}`);
  return r.sessionId;
}

async function conferir(sessionId: string, numeros: number[], method: 'MANUAL' | 'LEITOR' = 'MANUAL') {
  for (const n of numeros) await marcarComanda(user(), { sessionId, number: n, state: 'CONFERIDA', method });
}

describe('Abrir uma conferência', () => {
  it('nasce em andamento, com o escopo e o esperado congelados', async () => {
    const id = await abrirCompleta();
    const s = (await getSessao(user(), id))!;
    expect(s.status).toBe('EM_ANDAMENTO');
    expect(s.expected).toBe(10);
    expect(s.escopo).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.conferidas).toEqual([]);
  });

  it('a de FAIXA confere só a faixa escolhida', async () => {
    const r = await iniciarConferencia(user(), { unitId, type: 'FAIXA_DO_DIA', method: 'LEITOR', scopeNumbers: [1, 2, 3] });
    expect(r.ok).toBe(true);
    const s = (await getSessao(user(), r.ok ? r.sessionId : ''))!;
    expect(s.escopo).toEqual([1, 2, 3]);
    expect(s.expected).toBe(3);
  });

  it('faixa sem números é recusada — conferir "nada" não é conferência', async () => {
    const r = await iniciarConferencia(user(), { unitId, type: 'FAIXA_DO_DIA', method: 'MANUAL', scopeNumbers: [] });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('INVALID');
  });

  it('duas do MESMO tipo ao mesmo tempo são recusadas, oferecendo retomar a que existe', async () => {
    /* Duas pessoas marcando a mesma faixa produzem dois resultados parciais, e o
       último a finalizar apagaria o trabalho do outro sem aviso. */
    const primeira = await abrirCompleta();
    const segunda = await iniciarConferencia(user(), { unitId, type: 'COMPLETA', method: 'MANUAL' });
    expect(segunda.ok).toBe(false);
    expect(segunda.ok === false && segunda.reason).toBe('JA_EXISTE');
    expect(segunda.ok === false && segunda.sessionId).toBe(primeira);
  });
});

describe('Marcar comandas', () => {
  it('conta o progresso e sabe o que falta', async () => {
    const id = await abrirCompleta();
    await conferir(id, [1, 2, 3]);
    await marcarComanda(user(), { sessionId: id, number: 4, state: 'EM_USO', method: 'MANUAL' });

    const s = (await getSessao(user(), id))!;
    expect(s.conferidas).toEqual([1, 2, 3]);
    expect(s.emUso).toEqual([4]);
    expect(s.faltando).toEqual([5, 6, 7, 8, 9, 10]);
    expect(s.pct).toBe(40);
  });

  it('a MESMA leitura não conta duas vezes, e diz quando foi a primeira', async () => {
    const id = await abrirCompleta();
    const a = await marcarComanda(user(), { sessionId: id, number: 5, state: 'CONFERIDA', method: 'LEITOR' });
    const b = await marcarComanda(user(), { sessionId: id, number: 5, state: 'CONFERIDA', method: 'LEITOR' });

    expect(a.ok === true && a.jaEstava).toBe(false);
    expect(b.ok === true && b.jaEstava).toBe(true);
    expect(b.ok === true && b.em).toBeInstanceOf(Date);
    expect(b.ok === true && b.total).toBe(1);
  });

  it('desmarcar limpa a comanda — é o terceiro toque da grade', async () => {
    const id = await abrirCompleta();
    await conferir(id, [7]);
    await marcarComanda(user(), { sessionId: id, number: 7, state: null, method: 'MANUAL' });
    expect((await getSessao(user(), id))!.conferidas).toEqual([]);
  });

  it('comanda FORA da faixa é recusada, dizendo qual', async () => {
    const r = await iniciarConferencia(user(), { unitId, type: 'FAIXA_DO_DIA', method: 'LEITOR', scopeNumbers: [1, 2, 3] });
    const id = r.ok ? r.sessionId : '';
    const fora = await marcarComanda(user(), { sessionId: id, number: 9, state: 'CONFERIDA', method: 'LEITOR' });
    expect(fora.ok).toBe(false);
    expect(fora.ok === false && fora.detalhe).toContain('9');
  });

  it('guarda COMO e QUANDO cada uma foi conferida — é a auditoria', async () => {
    const id = await abrirCompleta();
    await marcarComanda(user(), { sessionId: id, number: 1, state: 'CONFERIDA', method: 'MANUAL' });
    await marcarComanda(user(), { sessionId: id, number: 2, state: 'CONFERIDA', method: 'LEITOR' });

    const d = (await detalheDaConferencia(user(), id))!;
    expect(d.items.find((i) => i.number === 1)?.method).toBe('MANUAL');
    expect(d.items.find((i) => i.number === 2)?.method).toBe('LEITOR');
    expect(d.items[0].at).toBeInstanceOf(Date);
  });
});

describe('Finalizar', () => {
  it('tudo conferido: sem ausentes, sem divergência', async () => {
    const id = await abrirCompleta();
    await conferir(id, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const r = await finalizarConferencia(user(), { sessionId: id });
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.faltando).toEqual([]);
    expect(r.ok === true && r.divergencias).toBe(0);

    const s = (await getSessao(user(), id))!;
    expect(s.status).toBe('CONCLUIDA');
    expect(s.finishedAt).toBeInstanceOf(Date);
  });

  it('faltando comanda: vira APURAÇÃO (divergência aberta), nunca "perdida"', async () => {
    /* Transformar ausência em perda na hora da contagem é dar por encerrado um
       assunto que ninguém analisou. */
    const id = await abrirCompleta();
    await conferir(id, [1, 2, 3, 4, 5, 6, 7, 8]);

    const r = await finalizarConferencia(user(), { sessionId: id, observation: 'faltaram duas no caixa 2' });
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.faltando.sort((a, b) => a - b)).toEqual([9, 10]);

    const divs = await prisma.commandDivergence.findMany({ where: { unitId }, select: { number: true, status: true } });
    expect(divs.map((d) => d.number).sort((a, b) => a - b)).toEqual([9, 10]);
    for (const d of divs) expect(d.status).toBe('OPEN');
  });

  it('exige observação quando há comanda não localizada', async () => {
    const id = await abrirCompleta();
    await conferir(id, [1, 2]);
    const r = await finalizarConferencia(user(), { sessionId: id });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('OBSERVATION_REQUIRED');
    /* E a sessão continua ABERTA — a recusa não pode perder o trabalho feito. */
    expect((await getSessao(user(), id))!.status).toBe('EM_ANDAMENTO');
  });

  it('EM USO conta como presente — não vira faltante', async () => {
    const id = await abrirCompleta();
    await conferir(id, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await marcarComanda(user(), { sessionId: id, number: 10, state: 'EM_USO', method: 'MANUAL' });

    const r = await finalizarConferencia(user(), { sessionId: id });
    expect(r.ok === true && r.faltando).toEqual([]);
  });

  it('a conferência CONCLUÍDA é imutável — não aceita mais marcação', async () => {
    const id = await abrirCompleta();
    await conferir(id, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await finalizarConferencia(user(), { sessionId: id });

    const depois = await marcarComanda(user(), { sessionId: id, number: 1, state: null, method: 'MANUAL' });
    expect(depois.ok).toBe(false);
    expect(depois.ok === false && depois.reason).toBe('JA_CONCLUIDA');
  });

  it('nem finalizar duas vezes', async () => {
    const id = await abrirCompleta();
    await conferir(id, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await finalizarConferencia(user(), { sessionId: id });
    const dnv = await finalizarConferencia(user(), { sessionId: id });
    expect(dnv.ok === false && dnv.reason).toBe('JA_CONCLUIDA');
  });
});

describe('Uma conferência NÃO apaga a anterior', () => {
  it('a nova nasce sem herdar marca nenhuma, e a antiga continua como estava', async () => {
    /* É o defeito que deu origem ao módulo: a grade reabria com as marcas de
       outra contagem e a tela tinha de avisar isso ao usuário. */
    const primeira = await abrirCompleta();
    await conferir(primeira, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await finalizarConferencia(user(), { sessionId: primeira });

    const segunda = await abrirCompleta();
    const nova = (await getSessao(user(), segunda))!;
    expect(nova.conferidas).toEqual([]);
    expect(nova.faltando).toHaveLength(10);

    const antiga = (await getSessao(user(), primeira))!;
    expect(antiga.status).toBe('CONCLUIDA');
    expect(antiga.conferidas).toHaveLength(10);
    expect(antiga.id).not.toBe(nova.id);
  });

  it('o histórico guarda as duas, a mais recente primeiro', async () => {
    const primeira = await abrirCompleta();
    await conferir(primeira, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await finalizarConferencia(user(), { sessionId: primeira });
    await abrirCompleta();

    const h = await listarConferencias(user(), { unitId });
    expect(h).toHaveLength(2);
    expect(h[0].startedAt.getTime()).toBeGreaterThanOrEqual(h[1].startedAt.getTime());
    expect(h.map((l) => l.status)).toContain('CONCLUIDA');
    expect(h.map((l) => l.responsavel)).toContain('Caixa Teste');
  });
});

describe('Conferência interrompida', () => {
  it('sair da tela não perde o trabalho: ela continua em andamento', async () => {
    const id = await abrirCompleta();
    await conferir(id, [1, 2, 3]);

    const retomada = (await sessaoEmAndamento(user(), unitId))!;
    expect(retomada.id).toBe(id);
    expect(retomada.conferidas).toEqual([1, 2, 3]);
    expect(retomada.faltando).toHaveLength(7);
  });

  it('cancelar encerra sem julgar nada — e o registro fica', async () => {
    const id = await abrirCompleta();
    await conferir(id, [1, 2]);
    expect((await cancelarConferencia(user(), id)).ok).toBe(true);

    expect((await getSessao(user(), id))!.status).toBe('CANCELADA');
    expect(await sessaoEmAndamento(user(), unitId)).toBeNull();
    /* Cancelada não abre divergência: ninguém terminou de conferir. */
    expect(await prisma.commandDivergence.count({ where: { unitId } })).toBe(0);
  });
});

describe('Escopo por unidade', () => {
  it('quem não enxerga a unidade não abre nem lê a conferência', async () => {
    const id = await abrirCompleta();
    const outro: SessionUser = { id: 'z', name: 'Outro', role: 'MANAGER', unitIds: ['unidade-alheia'], seesAllUnits: false, needsTerms: false };

    expect(await getSessao(outro, id)).toBeNull();
    const r = await iniciarConferencia(outro, { unitId, type: 'COMPLETA', method: 'MANUAL' });
    expect(r.ok === false && r.reason).toBe('FORBIDDEN');
  });
});
