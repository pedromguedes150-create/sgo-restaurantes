import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';
import { garantirTokenPublico } from '@/lib/pizzas/acesso';
import { salvarFechamento } from '@/lib/pizzas/fechamento';
import { diaAnterior } from '@/lib/pizzas/massas-calculo';
import {
  corrigirDesperdicio, corrigirRecebimento, estadoDoDia, excluirRecebimento, painelDeMassas,
  portaDaSessao, portaDoLink, registrarContagem, registrarDesperdicio, registrarRecebimento, serieDaUnidade,
} from '@/lib/pizzas/massas';
import type { SessionUser } from '@/lib/auth/session';

/**
 * As regras de EDIÇÃO e de RASTREABILIDADE — o que o motor puro não cobre.
 *
 *  - Link: só o dia atual (DIA_FECHADO para ontem).
 *  - Sessão: qualquer dia; ontem exige motivo (SEM_MOTIVO_ALTERACAO).
 *  - Toda mudança vira PizzaDoughChange com antes/depois/quem/motivo.
 *  - Divergência exige justificativa; correção retroativa não toca a contagem
 *    e sinaliza o dia.
 */

const sfx = process.pid.toString(36) + 'm';
let pizzariaId: string;
let semPizzariaId: string;
let token: string;
let hoje: string;
let ontem: string;
let gerenteId: string;
let caixaId: string;
let outroGerenteId: string;
let unit: { id: string; name: string; timezone: string; cutoffHour: number };

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente M', role: 'MANAGER', unitIds: [pizzariaId], seesAllUnits: false, needsTerms: false });
const caixa = (): SessionUser => ({ id: caixaId, name: 'Caixa', role: 'CASHIER', unitIds: [pizzariaId], seesAllUnits: false, needsTerms: false });
const gerenteDeOutra = (): SessionUser => ({ id: outroGerenteId, name: 'Outro', role: 'MANAGER', unitIds: [semPizzariaId], seesAllUnits: false, needsTerms: false });

const validade = '2099-12-31';

beforeAll(async () => {
  const u = await prisma.unit.create({ data: { code: `PZM-${sfx}`, name: 'U Massas', timezone: 'America/Sao_Paulo', cutoffHour: 4, hasPizzeria: true } });
  pizzariaId = u.id;
  unit = { id: u.id, name: u.name, timezone: u.timezone, cutoffHour: u.cutoffHour };
  hoje = currentOperationalDate(unit);
  ontem = diaAnterior(hoje);
  semPizzariaId = (await prisma.unit.create({ data: { code: `PZN-${sfx}`, name: 'U Sem', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente M', email: `pzm-g-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  caixaId = (await prisma.user.create({ data: { name: 'Caixa', email: `pzm-c-${sfx}@e.com`, role: 'CASHIER', passwordHash: 'x' } })).id;
  outroGerenteId = (await prisma.user.create({ data: { name: 'Outro', email: `pzm-o-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  token = await garantirTokenPublico(pizzariaId);
});

afterAll(async () => {
  const ids = [pizzariaId, semPizzariaId];
  await prisma.pizzaDoughChange.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.pizzaDoughWaste.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.pizzaDoughBatch.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.pizzaDoughCount.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.pizzaClosing.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, caixaId, outroGerenteId] } } });
});

describe('as duas portas', () => {
  it('o token resolve a unidade; token inválido não abre porta', async () => {
    expect((await portaDoLink(token))?.unit.id).toBe(pizzariaId);
    expect(await portaDoLink('nao-existe-nao-existe')).toBeNull();
  });

  it('a sessão exige perfil que corrige, escopo e pizzaria', async () => {
    expect((await portaDaSessao(gerente(), pizzariaId))?.autor.tipo).toBe('usuario');
    expect(await portaDaSessao(caixa(), pizzariaId), 'CAIXA não corrige').toBeNull();
    expect(await portaDaSessao(gerenteDeOutra(), pizzariaId), 'fora do escopo').toBeNull();
    expect(await portaDaSessao(gerente(), semPizzariaId), 'unidade sem pizzaria').toBeNull();
  });
});

describe('recebimento pelo link (só hoje)', () => {
  it('grava o lote de hoje e o estoque disponível soma', async () => {
    const p = (await portaDoLink(token))!;
    const r = await registrarRecebimento(p, { data: hoje, quantidade: 30, validade, lotCode: 'AB12' });
    expect(r.ok).toBe(true);
    const e = await estadoDoDia(unit, hoje);
    expect(e.dia.recebidas).toBe(30);
    expect(e.lotes.lotes[0].lotCode).toBe('AB12');
  });

  it('ontem é recusado pelo link — DIA_FECHADO', async () => {
    const p = (await portaDoLink(token))!;
    const r = await registrarRecebimento(p, { data: ontem, quantidade: 5, validade });
    expect(r).toEqual({ ok: false, reason: 'DIA_FECHADO' });
  });

  it('futuro nunca', async () => {
    const p = (await portaDoLink(token))!;
    const r = await registrarRecebimento(p, { data: '2099-01-01', quantidade: 5, validade });
    expect(r).toEqual({ ok: false, reason: 'DATA' });
  });

  it('quantidade zero ou validade vazia são recusadas', async () => {
    const p = (await portaDoLink(token))!;
    expect(await registrarRecebimento(p, { data: hoje, quantidade: 0, validade })).toEqual({ ok: false, reason: 'QUANTIDADE' });
    expect(await registrarRecebimento(p, { data: hoje, quantidade: 3, validade: '' })).toEqual({ ok: false, reason: 'VALIDADE' });
  });

  it('corrigir hoje pelo link funciona e deixa o rastro antes → depois', async () => {
    const p = (await portaDoLink(token))!;
    const lote = await prisma.pizzaDoughBatch.findFirstOrThrow({ where: { unitId: pizzariaId, lotCode: 'AB12' } });
    const r = await corrigirRecebimento(p, lote.id, { quantidade: 32, validade, lotCode: 'AB12' });
    expect(r.ok).toBe(true);

    const mudanca = await prisma.pizzaDoughChange.findFirst({ where: { entityId: lote.id, entity: 'recebimento' }, orderBy: { createdAt: 'desc' } });
    expect(mudanca?.before).toMatchObject({ quantidade: 30 });
    expect(mudanca?.after).toMatchObject({ quantidade: 32 });
    expect(mudanca?.changedById).toBeNull(); // link: sem sessão
    expect(mudanca?.retroactive).toBe(false);
  });
});

describe('correção pela gestão', () => {
  let loteDeOntemId: string;

  it('o gerente lança em dia anterior — com motivo', async () => {
    const p = (await portaDaSessao(gerente(), pizzariaId))!;
    const semMotivo = await registrarRecebimento(p, { data: ontem, quantidade: 10, validade });
    expect(semMotivo).toEqual({ ok: false, reason: 'SEM_MOTIVO_ALTERACAO' });

    const r = await registrarRecebimento(p, { data: ontem, quantidade: 10, validade, motivo: 'entrega de ontem não lançada' });
    expect(r.ok).toBe(true);
    if (r.ok) loteDeOntemId = r.id;

    const mudanca = await prisma.pizzaDoughChange.findFirstOrThrow({ where: { entityId: loteDeOntemId } });
    expect(mudanca.retroactive).toBe(true);
    expect(mudanca.reason).toBe('entrega de ontem não lançada');
    expect(mudanca.changedByName).toBe('Gerente M');
  });

  it('o gerente corrige HOJE sem precisar de motivo', async () => {
    const p = (await portaDaSessao(gerente(), pizzariaId))!;
    const r = await registrarDesperdicio(p, { data: hoje, quantidade: 1, motivo: 'BURNED' });
    expect(r.ok).toBe(true);
  });

  it('o link não consegue excluir o lote de ontem que o gerente lançou', async () => {
    const p = (await portaDoLink(token))!;
    expect(await excluirRecebimento(p, loteDeOntemId, null)).toEqual({ ok: false, reason: 'DIA_FECHADO' });
  });

  it('a exclusão é lógica e fica no histórico', async () => {
    const p = (await portaDaSessao(gerente(), pizzariaId))!;
    expect(await excluirRecebimento(p, loteDeOntemId, 'lançado em duplicidade')).toMatchObject({ ok: true });
    const lote = await prisma.pizzaDoughBatch.findUniqueOrThrow({ where: { id: loteDeOntemId } });
    expect(lote.deletedAt).not.toBeNull();
    const serie = await serieDaUnidade(pizzariaId);
    expect(serie.lotes.find((l) => l.id === loteDeOntemId)).toBeUndefined();
    const mudanca = await prisma.pizzaDoughChange.findFirst({ where: { entityId: loteDeOntemId }, orderBy: { createdAt: 'desc' } });
    expect(mudanca?.after).toBeNull();
    expect(mudanca?.reason).toBe('lançado em duplicidade');
  });
});

describe('desperdício', () => {
  it('motivo desconhecido e lote inexistente são recusados', async () => {
    const p = (await portaDoLink(token))!;
    expect(await registrarDesperdicio(p, { data: hoje, quantidade: 1, motivo: 'X' as never })).toEqual({ ok: false, reason: 'MOTIVO' });
    expect(await registrarDesperdicio(p, { data: hoje, quantidade: 1, motivo: 'EXPIRED', loteId: 'nao-existe' })).toEqual({ ok: false, reason: 'LOTE' });
  });

  it('descarte por validade aponta o lote e sai dele; a correção registra antes → depois', async () => {
    const p = (await portaDoLink(token))!;
    const lote = await prisma.pizzaDoughBatch.findFirstOrThrow({ where: { unitId: pizzariaId, lotCode: 'AB12' } });
    const r = await registrarDesperdicio(p, { data: hoje, quantidade: 2, motivo: 'EXPIRED', loteId: lote.id, observacao: 'embalagem aberta' });
    expect(r.ok).toBe(true);
    const e = await estadoDoDia(unit, hoje);
    expect(e.dia.perdaValidade).toBe(2);
    expect(e.dia.perdaProducao).toBe(1);
    /* 32 − 2 (validade, apontada) − 1 (queimada, FIFO do único lote) = 29 */
    expect(e.lotes.lotes.find((l) => l.id === lote.id)?.disponivel).toBe(29);

    if (r.ok) {
      const c = await corrigirDesperdicio(p, r.id, { quantidade: 3, motivo: 'EXPIRED', loteId: lote.id });
      expect(c.ok).toBe(true);
      const m = await prisma.pizzaDoughChange.findFirst({ where: { entityId: r.id }, orderBy: { createdAt: 'desc' } });
      expect(m?.before).toMatchObject({ quantidade: 2 });
      expect(m?.after).toMatchObject({ quantidade: 3 });
    }
  });
});

describe('fechamento do estoque', () => {
  it('as pizzas vendidas hoje descontam do esperado (1 pizza = 1 massa)', async () => {
    const r = await salvarFechamento({ token, operationalDate: hoje, contagens: { TEKNISA: { CM35: 4, CM30: 3, CM25: 0 }, IFOOD: { CM35: 1, CM30: 0, CM25: 2 } } });
    expect(r.ok).toBe(true);
    const e = await estadoDoDia(unit, hoje);
    expect(e.vendasFechadas).toBe(true);
    expect(e.dia.vendidas).toBe(10);
    /* 0 inicial + 32 recebidas − 10 pizzas − 4 desperdício (3 validade + 1 queimada) = 18 */
    expect(e.dia.esperado).toBe(18);
  });

  it('contagem que não bate SEM justificativa é recusada; com justificativa grava e sinaliza', async () => {
    const p = (await portaDoLink(token))!;
    expect(await registrarContagem(p, { data: hoje, fisico: 17 })).toEqual({ ok: false, reason: 'SEM_JUSTIFICATIVA' });
    const r = await registrarContagem(p, { data: hoje, fisico: 17, justificativa: 'uma massa caiu no chão' });
    expect(r).toMatchObject({ ok: true, esperado: 18, divergencia: -1 });
    const e = await estadoDoDia(unit, hoje);
    expect(e.dia.situacao).toBe('DIVERGENTE');
  });

  it('recontar hoje corrige, atualiza o esperado congelado e fica no histórico', async () => {
    const p = (await portaDoLink(token))!;
    const r = await registrarContagem(p, { data: hoje, fisico: 18 });
    expect(r).toMatchObject({ ok: true, divergencia: 0 });
    const e = await estadoDoDia(unit, hoje);
    expect(e.dia.situacao).toBe('CONFERIDO');
    const c = await prisma.pizzaDoughCount.findUniqueOrThrow({ where: { unitId_operationalDate: { unitId: pizzariaId, operationalDate: hoje } } });
    expect(c.expectedAtClose).toBe(18);
    const m = await prisma.pizzaDoughChange.findFirst({ where: { entityId: c.id }, orderBy: { createdAt: 'desc' } });
    expect(m?.before).toMatchObject({ fisico: 17 });
    expect(m?.after).toMatchObject({ fisico: 18 });
  });

  it('a divergência de hoje pelo link avisa o gerente da unidade', async () => {
    await prisma.unitMembership.create({ data: { userId: gerenteId, unitId: pizzariaId } });
    const p = (await portaDoLink(token))!;
    await registrarContagem(p, { data: hoje, fisico: 16, justificativa: 'duas massas rasgadas' });
    const n = await prisma.notification.findFirst({ where: { userId: gerenteId, title: 'Divergência no estoque de massas' }, orderBy: { createdAt: 'desc' } });
    expect(n?.body).toContain('16');
    /* devolve o dia ao estado conferido para os testes seguintes */
    await registrarContagem(p, { data: hoje, fisico: 18 });
  });
});

describe('alteração retroativa', () => {
  it('corrigir um recebimento de dia anterior recalcula, NÃO toca a contagem e sinaliza RETROATIVO', async () => {
    const g = (await portaDaSessao(gerente(), pizzariaId))!;
    /* Constrói "ontem" pela gestão: recebeu 20, contou 20 (conferido). */
    const lote = await registrarRecebimento(g, { data: ontem, quantidade: 20, validade, motivo: 'montando o histórico' });
    expect(lote.ok).toBe(true);
    const contagem = await registrarContagem(g, { data: ontem, fisico: 20, motivoAlteracao: 'fechando ontem' });
    expect(contagem).toMatchObject({ ok: true, divergencia: 0 });

    /* Hoje agora parte de 20 (a contagem de ontem é a âncora). */
    const antes = await estadoDoDia(unit, hoje);
    expect(antes.dia.inicial).toBe(20);

    /* Descobre-se que ontem foram 22, não 20. */
    if (lote.ok) {
      const c = await corrigirRecebimento(g, lote.id, { quantidade: 22, validade, motivo: 'quantidade da entrega lançada incorretamente' });
      expect(c.ok).toBe(true);
    }

    const ontemDepois = await estadoDoDia(unit, ontem);
    expect(ontemDepois.dia.esperado).toBe(22);
    expect(ontemDepois.dia.fisico).toBe(20); // a contagem NÃO mudou
    expect(ontemDepois.dia.situacao).toBe('RETROATIVO');
    expect(ontemDepois.dia.alteradoDepois).toBe(true);

    /* O esperado congelado de ontem ficou 20: é o retrato do fechamento. */
    const c = await prisma.pizzaDoughCount.findUniqueOrThrow({ where: { unitId_operationalDate: { unitId: pizzariaId, operationalDate: ontem } } });
    expect(c.expectedAtClose).toBe(20);

    /* Hoje continua ancorado na CONTAGEM de ontem (20), não no esperado (22). */
    const hojeDepois = await estadoDoDia(unit, hoje);
    expect(hojeDepois.dia.inicial).toBe(20);
  });

  it('o painel do período mostra as divergências, as perdas separadas e o histórico de alterações', async () => {
    const p = await painelDeMassas(pizzariaId, { de: ontem, ate: hoje, hoje });
    expect(p.dias.map((d) => d.data)).toEqual([hoje, ontem]);
    expect(p.resumo.perdaValidade).toBe(3);
    expect(p.resumo.perdaProducao).toBe(1);
    /* DUAS: ontem (corrigido de 20 para 22 depois de contado) e HOJE — que
       tinha sido fechado com inicial 0 e passou a partir dos 20 contados
       ontem, porque "ontem" inteiro foi construído depois. As duas batiam no
       fechamento e deixaram de bater pela alteração: as duas são RETROATIVO,
       e a contagem física de nenhuma delas mudou. */
    expect(p.resumo.divergencias).toBe(2);
    expect(p.dias.find((d) => d.data === hoje)?.situacao).toBe('RETROATIVO');
    expect(p.dias.find((d) => d.data === hoje)?.fisico).toBe(18);
    const retroativas = p.alteracoes.filter((a) => a.retroativa);
    expect(retroativas.length).toBeGreaterThan(0);
    expect(retroativas.some((a) => a.motivo === 'quantidade da entrega lançada incorretamente')).toBe(true);
    expect(p.alteracoes.some((a) => a.por === 'Link da pizzaria')).toBe(true);
  });

  it('tudo entrou na Auditoria com a origem', async () => {
    const logs = await prisma.auditLog.findMany({ where: { unitId: pizzariaId, module: 'PIZZAS', action: { startsWith: 'PIZZA_DOUGH_' } } });
    expect(logs.length).toBeGreaterThan(5);
    const origens = new Set(logs.map((l) => (l.metadata as { origem?: string })?.origem));
    expect(origens.has('link-publico')).toBe(true);
    expect(origens.has('sgo')).toBe(true);
  });
});
