import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { format, subDays } from 'date-fns';
import { currentOperationalDate } from '@/lib/date/operational';
import { recortarPizzas, unidadePorToken, unidadesComPizzaria, garantirTokenPublico, PIZZAS_NAV } from '@/lib/pizzas/acesso';
import { salvarFechamento, fechamentoDoDia } from '@/lib/pizzas/fechamento';
import { inicioDoPeriodo, painelDePizzas } from '@/lib/pizzas/painel';
import { alternarSabor, criarSabor, excluirSabor, listarSabores, renomearSabor } from '@/lib/pizzas/catalogo';
import { totalDePizzas, totaisPorTamanho, rotuloDoTamanho } from '@/lib/pizzas/tipos';
import type { SessionUser } from '@/lib/auth/session';

describe('vocabulário do módulo (puro)', () => {
  it('soma o total de pizzas ignorando quantidade não numérica', () => {
    expect(totalDePizzas([{ quantity: 12 }, { quantity: 8 }, { quantity: NaN }])).toBe(20);
  });

  it('agrupa por tamanho na ordem de venda, com zero para tamanho sem linha', () => {
    const t = totaisPorTamanho([
      { size: 'CM35', flavorId: 'a', quantity: 12 },
      { size: 'CM35', flavorId: 'b', quantity: 8 },
      { size: 'CM30', flavorId: 'a', quantity: 5 },
    ]);
    expect(t.map((x) => [x.rotulo, x.total])).toEqual([
      ['35 cm', 20],
      ['30 cm', 5],
      ['25 cm', 0],
    ]);
  });

  it('só existem os três tamanhos da casa', () => {
    expect(rotuloDoTamanho('CM25')).toBe('25 cm');
  });
});

describe('recorte de navegação por unidade (puro)', () => {
  it('tira o Controle de Pizzas de quem não tem pizzaria', () => {
    const menu = ['/dashboard', PIZZAS_NAV, '/modulos/oleo'];
    expect(recortarPizzas(menu, false)).toEqual(['/dashboard', '/modulos/oleo']);
  });

  it('mantém o módulo para quem tem', () => {
    const menu = ['/dashboard', PIZZAS_NAV];
    expect(recortarPizzas(menu, true)).toEqual(menu);
  });
});

const sfx = process.pid.toString(36);
let pizzariaId: string;
let semPizzariaId: string;
let token: string;
let calabresaId: string;
let frangoId: string;
let inativoId: string;
let deOutraUnidadeId: string;
let hoje: string;

/* Usuários REAIS no banco, não ids inventados: a auditoria tem FK para `users`
   e um id fantasma a faria falhar em silêncio — `audit()` engole o erro para
   nunca derrubar a operação, então o teste passaria sem auditar nada. */
let gerenteId: string;
let outroGerenteId: string;
let adminId: string;

const gerenteDaPizzaria = (): SessionUser => ({ id: gerenteId, name: 'G', role: 'MANAGER', unitIds: [pizzariaId], seesAllUnits: false, needsTerms: false });
const gerenteDeOutra = (): SessionUser => ({ id: outroGerenteId, name: 'O', role: 'MANAGER', unitIds: [semPizzariaId], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  const pizzaria = await prisma.unit.create({
    data: { code: `PZZ-${sfx}`, name: 'U Pizzaria', timezone: 'America/Sao_Paulo', cutoffHour: 4, hasPizzeria: true },
  });
  pizzariaId = pizzaria.id;
  hoje = currentOperationalDate({ timezone: pizzaria.timezone, cutoffHour: pizzaria.cutoffHour });

  semPizzariaId = (
    await prisma.unit.create({
      data: { code: `SPZ-${sfx}`, name: 'U Sem Pizzaria', timezone: 'America/Sao_Paulo', cutoffHour: 4 },
    })
  ).id;

  gerenteId = (await prisma.user.create({ data: { name: 'G', email: `pzg-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  outroGerenteId = (await prisma.user.create({ data: { name: 'O', email: `pzo-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'A', email: `pza-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;

  token = await garantirTokenPublico(pizzariaId);

  calabresaId = (await prisma.pizzaFlavor.create({ data: { unitId: pizzariaId, name: `Calabresa ${sfx}`, order: 0 } })).id;
  frangoId = (await prisma.pizzaFlavor.create({ data: { unitId: pizzariaId, name: `Frango ${sfx}`, order: 1 } })).id;
  inativoId = (await prisma.pizzaFlavor.create({ data: { unitId: pizzariaId, name: `Saiu de linha ${sfx}`, active: false } })).id;
  deOutraUnidadeId = (await prisma.pizzaFlavor.create({ data: { unitId: semPizzariaId, name: `Outro ${sfx}` } })).id;
});

afterAll(async () => {
  await prisma.pizzaClosing.deleteMany({ where: { unitId: { in: [pizzariaId, semPizzariaId] } } });
  await prisma.pizzaFlavor.deleteMany({ where: { unitId: { in: [pizzariaId, semPizzariaId] } } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [pizzariaId, semPizzariaId] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [pizzariaId, semPizzariaId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, outroGerenteId, adminId] } } });
});

describe('quem alcança o módulo', () => {
  it('o gerente da pizzaria vê a unidade', async () => {
    const us = await unidadesComPizzaria(gerenteDaPizzaria());
    expect(us.map((u) => u.id)).toContain(pizzariaId);
  });

  it('o gerente de outra unidade não vê nenhuma — o módulo não existe para ele', async () => {
    const us = await unidadesComPizzaria(gerenteDeOutra());
    expect(us.map((u) => u.id)).not.toContain(pizzariaId);
  });

  it('ADMIN vê todas as unidades com pizzaria', async () => {
    const us = await unidadesComPizzaria(admin());
    expect(us.map((u) => u.id)).toContain(pizzariaId);
  });
});

describe('o token é a credencial do link público', () => {
  it('resolve a unidade certa', async () => {
    const u = await unidadePorToken(token);
    expect(u?.id).toBe(pizzariaId);
  });

  it('token inválido não resolve nada', async () => {
    expect(await unidadePorToken('naoexiste'.repeat(3))).toBeNull();
  });

  it('é estável entre chamadas — não regenera a cada abertura do painel', async () => {
    expect(await garantirTokenPublico(pizzariaId)).toBe(token);
  });

  it('unidade sem pizzaria não tem link, mesmo que alguém adivinhe um token', async () => {
    await prisma.unit.update({ where: { id: semPizzariaId }, data: { pizzaPublicToken: `livre-${sfx}-0123456789` } });
    expect(await unidadePorToken(`livre-${sfx}-0123456789`)).toBeNull();
  });
});

describe('fechamento do dia', () => {
  it('grava o fechamento e devolve o total', async () => {
    const r = await salvarFechamento({
      token,
      items: [
        { size: 'CM35', flavorId: calabresaId, quantity: 12 },
        { size: 'CM35', flavorId: frangoId, quantity: 8 },
        { size: 'CM30', flavorId: calabresaId, quantity: 5 },
      ],
    });
    expect(r).toMatchObject({ ok: true, total: 25, substituiu: false, operationalDate: hoje });
  });

  it('recusa o segundo envio da mesma data em vez de sobrescrever calado', async () => {
    const r = await salvarFechamento({ token, items: [{ size: 'CM25', flavorId: calabresaId, quantity: 3 }] });
    expect(r).toEqual({ ok: false, reason: 'DUPLICADO' });
    // e o que já estava gravado continua intacto
    const atual = await fechamentoDoDia(pizzariaId, hoje);
    expect(totalDePizzas(atual!.items)).toBe(25);
  });

  it('com `substituir` a correção passa e troca os itens', async () => {
    const r = await salvarFechamento({
      token,
      substituir: true,
      items: [{ size: 'CM25', flavorId: calabresaId, quantity: 3 }],
      observation: 'refeito',
    });
    expect(r).toMatchObject({ ok: true, total: 3, substituiu: true });
    const atual = await fechamentoDoDia(pizzariaId, hoje);
    expect(atual!.items).toHaveLength(1);
    expect(atual!.observation).toBe('refeito');
  });

  it('a mesma combinação tamanho+sabor SOMA em vez de estourar a unique', async () => {
    const r = await salvarFechamento({
      token,
      substituir: true,
      items: [
        { size: 'CM35', flavorId: calabresaId, quantity: 4 },
        { size: 'CM35', flavorId: calabresaId, quantity: 6 },
      ],
    });
    expect(r).toMatchObject({ ok: true, total: 10 });
    const atual = await fechamentoDoDia(pizzariaId, hoje);
    expect(atual!.items).toHaveLength(1);
    expect(atual!.items[0].quantity).toBe(10);
  });

  it('guarda o nome do sabor do dia — renomear o catálogo não reescreve o histórico', async () => {
    const atual = await fechamentoDoDia(pizzariaId, hoje);
    expect(atual!.items[0].flavorName).toContain('Calabresa');
  });

  it('recusa sabor de OUTRA unidade', async () => {
    const r = await salvarFechamento({
      token,
      substituir: true,
      items: [{ size: 'CM35', flavorId: deOutraUnidadeId, quantity: 1 }],
    });
    expect(r).toEqual({ ok: false, reason: 'ITENS' });
  });

  it('recusa sabor desativado', async () => {
    const r = await salvarFechamento({ token, substituir: true, items: [{ size: 'CM35', flavorId: inativoId, quantity: 1 }] });
    expect(r).toEqual({ ok: false, reason: 'ITENS' });
  });

  it('recusa quantidade zero, negativa ou quebrada', async () => {
    for (const quantity of [0, -3, 1.5]) {
      const r = await salvarFechamento({ token, substituir: true, items: [{ size: 'CM35', flavorId: calabresaId, quantity }] });
      expect(r, `quantidade ${quantity}`).toEqual({ ok: false, reason: 'ITENS' });
    }
  });

  it('recusa lista vazia', async () => {
    expect(await salvarFechamento({ token, substituir: true, items: [] })).toEqual({ ok: false, reason: 'ITENS' });
  });

  it('recusa data futura', async () => {
    const amanha = format(subDays(new Date(`${hoje}T12:00:00`), -1), 'yyyy-MM-dd');
    const r = await salvarFechamento({ token, operationalDate: amanha, items: [{ size: 'CM35', flavorId: calabresaId, quantity: 1 }] });
    expect(r).toEqual({ ok: false, reason: 'DATA' });
  });

  it('recusa data velha demais para um link sem login', async () => {
    const antiga = format(subDays(new Date(`${hoje}T12:00:00`), 45), 'yyyy-MM-dd');
    const r = await salvarFechamento({ token, operationalDate: antiga, items: [{ size: 'CM35', flavorId: calabresaId, quantity: 1 }] });
    expect(r).toEqual({ ok: false, reason: 'DATA' });
  });

  it('token inválido não grava nada', async () => {
    const r = await salvarFechamento({ token: 'xxxxxxxxxxxxxxxxxx', items: [{ size: 'CM35', flavorId: calabresaId, quantity: 1 }] });
    expect(r).toEqual({ ok: false, reason: 'TOKEN' });
  });

  it('a gravação entra na Auditoria', async () => {
    const logs = await prisma.auditLog.findMany({ where: { unitId: pizzariaId, module: 'PIZZAS' } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.action === 'PIZZA_CLOSING_UPDATE')).toBe(true);
  });
});

describe('catálogo de sabores (Configurações)', () => {
  it('o gerente não gerencia o catálogo — é tela de Configurações', async () => {
    const r = await criarSabor(gerenteDaPizzaria(), { unitId: pizzariaId, name: `Proibido ${sfx}` });
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('cria, lista e renomeia', async () => {
    const nome = `Catupiry ${sfx}`;
    const r = await criarSabor(admin(), { unitId: pizzariaId, name: nome });
    expect(r.ok).toBe(true);
    const criado = (await listarSabores(admin(), pizzariaId)).find((s) => s.name === nome);
    expect(criado).toBeTruthy();

    const novo = `Catupiry especial ${sfx}`;
    expect(await renomearSabor(admin(), { id: criado!.id, name: novo })).toEqual({ ok: true });
    const depois = await listarSabores(admin(), pizzariaId);
    expect(depois.some((s) => s.name === novo)).toBe(true);
  });

  it('recusa nome repetido na mesma unidade', async () => {
    const r = await criarSabor(admin(), { unitId: pizzariaId, name: `Calabresa ${sfx}` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CONFLICT');
  });

  it('recusa catálogo em unidade que não tem pizzaria', async () => {
    const r = await criarSabor(admin(), { unitId: semPizzariaId, name: `Qualquer ${sfx}` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('sabor JÁ LANÇADO não se exclui — desativa, para o histórico não perder linhas', async () => {
    const r = await excluirSabor(admin(), calabresaId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('BLOCKED');

    expect(await alternarSabor(admin(), { id: calabresaId, active: false })).toEqual({ ok: true });
    const fora = (await listarSabores(admin(), pizzariaId)).find((s) => s.id === calabresaId);
    expect(fora?.active).toBe(false);
    expect(fora?.lancamentos).toBeGreaterThan(0);
    await alternarSabor(admin(), { id: calabresaId, active: true }); // devolve ao cardápio
  });

  it('sabor sem lançamento pode ser excluído', async () => {
    const novo = await criarSabor(admin(), { unitId: pizzariaId, name: `Descartável ${sfx}` });
    expect(novo.ok).toBe(true);
    if (novo.ok) expect(await excluirSabor(admin(), novo.id!)).toEqual({ ok: true });
  });

  it('renomear NÃO reescreve o histórico já fechado', async () => {
    const antes = await fechamentoDoDia(pizzariaId, hoje);
    const nomeNoFechamento = antes!.items[0].flavorName;
    await renomearSabor(admin(), { id: calabresaId, name: `Calabresa renomeada ${sfx}` });
    const depois = await fechamentoDoDia(pizzariaId, hoje);
    expect(depois!.items[0].flavorName).toBe(nomeNoFechamento);
  });
});

describe('painel', () => {
  it('soma o período, separa por tamanho e por sabor, e calcula a média por dia lançado', async () => {
    const ontem = format(subDays(new Date(`${hoje}T12:00:00`), 1), 'yyyy-MM-dd');
    await salvarFechamento({
      token,
      operationalDate: hoje,
      substituir: true,
      items: [
        { size: 'CM35', flavorId: calabresaId, quantity: 10 },
        { size: 'CM30', flavorId: frangoId, quantity: 6 },
      ],
    });
    await salvarFechamento({
      token,
      operationalDate: ontem,
      substituir: true,
      items: [{ size: 'CM35', flavorId: calabresaId, quantity: 4 }],
    });

    const p = await painelDePizzas(pizzariaId, { de: inicioDoPeriodo(hoje, 30), ate: hoje, hoje });
    expect(p.total).toBe(20);
    expect(p.hoje).toBe(16);
    expect(p.diasComRegistro).toBe(2);
    expect(p.mediaDiaria).toBe(10);
    expect(p.porTamanho.find((t) => t.size === 'CM35')!.total).toBe(14);
    expect(p.porTamanho.find((t) => t.size === 'CM25')!.total).toBe(0);
    expect(p.porSabor[0].total).toBe(14); // calabresa lidera
    expect(p.dias[0].operationalDate).toBe(hoje); // mais recente primeiro
  });

  it('o cartão "hoje" não depende do período filtrado', async () => {
    /* Período que termina ONTEM: o total do período exclui hoje, mas o cartão
       do dia continua tendo de mostrar o dia corrente. */
    const ontem = format(subDays(new Date(`${hoje}T12:00:00`), 1), 'yyyy-MM-dd');
    const p = await painelDePizzas(pizzariaId, { de: inicioDoPeriodo(ontem, 7), ate: ontem, hoje });
    expect(p.total).toBe(4);
    expect(p.hoje).toBe(16);
  });

  it('período sem lançamento não divide por zero', async () => {
    const velho = format(subDays(new Date(`${hoje}T12:00:00`), 200), 'yyyy-MM-dd');
    const p = await painelDePizzas(pizzariaId, { de: inicioDoPeriodo(velho, 7), ate: velho, hoje });
    expect(p.total).toBe(0);
    expect(p.mediaDiaria).toBe(0);
    expect(p.dias).toEqual([]);
  });
});
