import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { format, subDays } from 'date-fns';
import { currentOperationalDate } from '@/lib/date/operational';
import { recortarPizzas, unidadePorToken, unidadesComPizzaria, garantirTokenPublico, PIZZAS_NAV } from '@/lib/pizzas/acesso';
import { salvarFechamento, fechamentoDoDia } from '@/lib/pizzas/fechamento';
import { inicioDoPeriodo, painelDePizzas } from '@/lib/pizzas/painel';
import { alternarSabor, criarSabor, excluirSabor, listarSabores, renomearSabor } from '@/lib/pizzas/catalogo';
import {
  contagensVazias, contagensDeLinhas, linhasDeContagem, nomeComercial, quantidadeValida,
  rotuloDoCanal, rotuloDoTamanho, totalDoCanal, totalGeral, type ContagensDoFechamento,
} from '@/lib/pizzas/tipos';
import type { SessionUser } from '@/lib/auth/session';

/** Atalho de leitura: monta as seis quantidades numa linha só. */
const conta = (t35: number, t30: number, t25: number, i35: number, i30: number, i25: number): ContagensDoFechamento => ({
  TEKNISA: { CM35: t35, CM30: t30, CM25: t25 },
  IFOOD: { CM35: i35, CM30: i30, CM25: i25 },
});

describe('vocabulário do módulo (puro)', () => {
  it('soma cada canal e o total geral — é a conta que a tela mostra antes de enviar', () => {
    /* O exemplo do pedido: Teknisa 10+5+3 = 18, iFood 4+2+1 = 7, geral 25. */
    const c = conta(10, 5, 3, 4, 2, 1);
    expect(totalDoCanal(c, 'TEKNISA')).toBe(18);
    expect(totalDoCanal(c, 'IFOOD')).toBe(7);
    expect(totalGeral(c)).toBe(25);
  });

  it('um fechamento vazio soma zero, sem estourar', () => {
    expect(totalGeral(contagensVazias())).toBe(0);
  });

  it('quantidade válida é inteiro de zero a dez mil', () => {
    for (const v of [0, 1, 10_000]) expect(quantidadeValida(v), String(v)).toBe(true);
    for (const v of [-1, 1.5, NaN, '', 10_001, 'x']) expect(quantidadeValida(v), String(v)).toBe(false);
  });

  it('as seis linhas vão e voltam iguais', () => {
    /* O caminho de ida (gravar) e o de volta (abrir para corrigir) precisam
       resultar na MESMA tabela — senão corrigir um dia mudaria os números sem
       ninguém digitar nada. */
    const c = conta(9, 8, 7, 6, 5, 4);
    const linhas = linhasDeContagem(c);
    expect(linhas).toHaveLength(6);
    expect(contagensDeLinhas(linhas)).toEqual(c);
  });

  it('os rótulos são os da pizzaria', () => {
    expect(rotuloDoTamanho('CM25')).toBe('25 cm');
    expect(nomeComercial('CM35')).toBe('Gigante');
    expect(nomeComercial('CM30')).toBe('Grande');
    expect(nomeComercial('CM25')).toBe('Brotinho');
    expect(rotuloDoCanal('IFOOD')).toBe('iFood');
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

/**
 * Um fechamento no formato ANTIGO (por sabor), gravado direto no banco.
 *
 * O formulário não produz mais isso — e é justamente por isso que o teste
 * precisa produzir: as regras do catálogo e a leitura do painel existem para
 * proteger esse histórico, e sem ele os casos passariam sem exercitar nada.
 */
async function lancamentoLegado(flavorId: string, diasAtras: number, quantity: number): Promise<string> {
  const dia = format(subDays(new Date(`${hoje}T12:00:00`), diasAtras), 'yyyy-MM-dd');
  const sabor = await prisma.pizzaFlavor.findUnique({ where: { id: flavorId }, select: { name: true } });
  const c = await prisma.pizzaClosing.upsert({
    where: { unitId_operationalDate: { unitId: pizzariaId, operationalDate: dia } },
    create: { unitId: pizzariaId, operationalDate: dia },
    update: {},
  });
  await prisma.pizzaClosingItem.deleteMany({ where: { closingId: c.id } });
  await prisma.pizzaClosingItem.create({
    data: { closingId: c.id, size: 'CM30', flavorId, flavorName: sabor!.name, quantity },
  });
  return dia;
}

describe('fechamento do dia', () => {
  it('grava as seis quantidades e devolve o total geral', async () => {
    const r = await salvarFechamento({ token, contagens: conta(10, 5, 3, 4, 2, 1) });
    expect(r).toMatchObject({ ok: true, total: 25, substituiu: false, operationalDate: hoje });

    const atual = await fechamentoDoDia(pizzariaId, hoje);
    expect(atual!.contagens).toEqual(conta(10, 5, 3, 4, 2, 1));
  });

  it('separa Teknisa de iFood no banco — é o que permite o relatório por canal', async () => {
    const linhas = await prisma.pizzaClosingCount.findMany({
      where: { closing: { unitId: pizzariaId, operationalDate: hoje } },
      select: { channel: true, size: true, quantity: true },
    });
    expect(linhas).toHaveLength(6);
    expect(linhas.find((l) => l.channel === 'IFOOD' && l.size === 'CM35')!.quantity).toBe(4);
    expect(linhas.find((l) => l.channel === 'TEKNISA' && l.size === 'CM25')!.quantity).toBe(3);
  });

  it('zero em um canal inteiro é válido — vender só por um deles acontece', async () => {
    const r = await salvarFechamento({ token, substituir: true, contagens: conta(6, 0, 0, 0, 0, 0) });
    expect(r).toMatchObject({ ok: true, total: 6 });
  });

  it('recusa o segundo envio da mesma data em vez de sobrescrever calado', async () => {
    const r = await salvarFechamento({ token, contagens: conta(1, 0, 0, 0, 0, 0) });
    expect(r).toEqual({ ok: false, reason: 'DUPLICADO' });
    const atual = await fechamentoDoDia(pizzariaId, hoje);
    expect(totalGeral(atual!.contagens)).toBe(6);
  });

  it('com `substituir` a correção passa e troca as quantidades', async () => {
    const r = await salvarFechamento({ token, substituir: true, contagens: conta(0, 0, 3, 0, 0, 0), observation: 'refeito' });
    expect(r).toMatchObject({ ok: true, total: 3, substituiu: true });
    const atual = await fechamentoDoDia(pizzariaId, hoje);
    expect(atual!.contagens).toEqual(conta(0, 0, 3, 0, 0, 0));
    expect(atual!.observation).toBe('refeito');
  });

  it('as SEIS em zero são recusadas — dia sem venda é dia sem fechamento', async () => {
    /* Gravar um dia de zero pizzas entraria na média por dia lançado e a
       afundaria com um dia em que a pizzaria nem abriu. */
    const r = await salvarFechamento({ token, substituir: true, contagens: contagensVazias() });
    expect(r).toEqual({ ok: false, reason: 'VAZIO' });
  });

  it('recusa quantidade negativa, quebrada ou absurda', async () => {
    for (const q of [-3, 1.5, 10_001]) {
      const r = await salvarFechamento({ token, substituir: true, contagens: conta(q, 0, 0, 0, 0, 0) });
      expect(r, `quantidade ${q}`).toEqual({ ok: false, reason: 'QUANTIDADES' });
    }
  });

  it('campo ausente conta como zero, não como erro', async () => {
    /* O corpo vem de um link público: faltar chave é normal, e recusar o
       fechamento inteiro por isso seria hostil com quem só não vendeu brotinho. */
    const r = await salvarFechamento({ token, substituir: true, contagens: { TEKNISA: { CM35: 4 } } as never });
    expect(r).toMatchObject({ ok: true, total: 4 });
  });

  it('recusa data futura', async () => {
    const amanha = format(subDays(new Date(`${hoje}T12:00:00`), -1), 'yyyy-MM-dd');
    expect(await salvarFechamento({ token, operationalDate: amanha, contagens: conta(1, 0, 0, 0, 0, 0) })).toEqual({ ok: false, reason: 'DATA' });
  });

  it('recusa data velha demais para um link sem login', async () => {
    const antiga = format(subDays(new Date(`${hoje}T12:00:00`), 45), 'yyyy-MM-dd');
    expect(await salvarFechamento({ token, operationalDate: antiga, contagens: conta(1, 0, 0, 0, 0, 0) })).toEqual({ ok: false, reason: 'DATA' });
  });

  it('token inválido não grava nada', async () => {
    expect(await salvarFechamento({ token: 'xxxxxxxxxxxxxxxxxx', contagens: conta(1, 0, 0, 0, 0, 0) })).toEqual({ ok: false, reason: 'TOKEN' });
  });

  it('a gravação entra na Auditoria, com os totais de cada canal', async () => {
    const logs = await prisma.auditLog.findMany({ where: { unitId: pizzariaId, module: 'PIZZAS' }, orderBy: { createdAt: 'desc' } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.action === 'PIZZA_CLOSING_UPDATE')).toBe(true);
    const meta = logs.find((l) => l.action === 'PIZZA_CLOSING_UPDATE')!.metadata as Record<string, unknown>;
    expect(meta).toHaveProperty('teknisa');
    expect(meta).toHaveProperty('ifood');
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
    /* O formulário novo não lança sabor, então o "já lançado" precisa vir de um
       fechamento LEGADO — que é exatamente o histórico que esta regra protege. */
    await lancamentoLegado(calabresaId, 5, 9);

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
    const dia = await lancamentoLegado(calabresaId, 6, 4);
    const antes = await fechamentoDoDia(pizzariaId, dia);
    const nomeNoFechamento = antes!.items[0].flavorName;
    await renomearSabor(admin(), { id: calabresaId, name: `Calabresa renomeada ${sfx}` });
    const depois = await fechamentoDoDia(pizzariaId, dia);
    expect(depois!.items[0].flavorName).toBe(nomeNoFechamento);
  });
});

describe('painel', () => {
  /* O painel parte de uma unidade LIMPA. Os blocos anteriores deixam
     fechamentos para trás (inclusive os legados que as regras do catálogo
     precisam ter), e um painel que soma o resíduo dos vizinhos falha por
     motivo errado — ou, pior, passa por motivo errado. */
  beforeAll(async () => {
    await prisma.pizzaClosing.deleteMany({ where: { unitId: pizzariaId } });
  });

  it('soma o período, separa por canal e por tamanho, e calcula a média por dia lançado', async () => {
    const ontem = format(subDays(new Date(`${hoje}T12:00:00`), 1), 'yyyy-MM-dd');
    await salvarFechamento({ token, operationalDate: hoje, substituir: true, contagens: conta(10, 6, 0, 0, 0, 0) });
    await salvarFechamento({ token, operationalDate: ontem, substituir: true, contagens: conta(0, 0, 0, 4, 0, 0) });

    const p = await painelDePizzas(pizzariaId, { de: inicioDoPeriodo(hoje, 30), ate: hoje, hoje });
    expect(p.total).toBe(20);
    expect(p.hoje).toBe(16);
    expect(p.diasComRegistro).toBe(2);
    expect(p.mediaDiaria).toBe(10);

    /* "Tamanhos mais vendidos" soma os DOIS canais — é o total real de 35 cm. */
    const g = p.porTamanho.find((t) => t.size === 'CM35')!;
    expect(g.total).toBe(14);
    expect(g.porCanal.TEKNISA).toBe(10);
    expect(g.porCanal.IFOOD).toBe(4);
    expect(p.porTamanho.find((t) => t.size === 'CM25')!.total).toBe(0);

    const teknisa = p.porCanal.find((c) => c.canal === 'TEKNISA')!;
    const ifood = p.porCanal.find((c) => c.canal === 'IFOOD')!;
    expect(teknisa.total).toBe(16);
    expect(ifood.total).toBe(4);
    expect(teknisa.pct + ifood.pct).toBe(100);

    expect(p.dias[0].operationalDate).toBe(hoje);
    expect(p.dias[0]).toMatchObject({ total: 16, teknisa: 16, ifood: 0 });
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
    expect(p.porCanal.every((c) => c.total === 0 && c.pct === 0)).toBe(true);
  });

  it('o histórico ANTIGO, lançado por sabor, continua no painel', async () => {
    /* O formulário não pede mais sabor, mas os fechamentos já gravados assim
       são histórico que ninguém tem como refazer. Ler só as contagens novas
       faria meses desaparecerem do painel sem ninguém ter apagado nada. */
    const antigo = await lancamentoLegado(frangoId, 3, 7);

    expect(antigo).toBeTruthy();
    const p = await painelDePizzas(pizzariaId, { de: inicioDoPeriodo(hoje, 30), ate: hoje, hoje });
    expect(p.total).toBe(27);
    expect(p.porTamanho.find((t) => t.size === 'CM30')!.total).toBe(13);
    expect(p.porSabor[0].total).toBe(7);
    /* E NÃO é atribuído a canal nenhum: a venda antiga é anterior à separação,
       e jogá-la no Teknisa inventaria uma origem que ninguém registrou. */
    const soma = p.porCanal.reduce((t, x) => t + x.total, 0);
    expect(soma).toBe(20);
  });

  it('corrigir um dia antigo pelo formulário novo não conta a venda duas vezes', async () => {
    const antigo = format(subDays(new Date(`${hoje}T12:00:00`), 3), 'yyyy-MM-dd');
    await salvarFechamento({ token, operationalDate: antigo, substituir: true, contagens: conta(0, 9, 0, 0, 0, 0) });

    const p = await painelDePizzas(pizzariaId, { de: inicioDoPeriodo(hoje, 30), ate: hoje, hoje });
    /* 20 dos dois dias novos + 9 do dia corrigido — as 7 por sabor daquele dia
       saíram junto com a correção. */
    expect(p.total).toBe(29);
    expect(p.porSabor).toEqual([]);
  });
});

describe('a comparação Teknisa x iFood', () => {
  it('a porcentagem é entre os DOIS canais, não sobre o total do período', async () => {
    /* Com fechamento antigo no período (sem canal), medir sobre o total
       deixaria a barra quase vazia — como se os dois canais juntos fossem uma
       fração da venda. O cartão compara um canal com o outro. */
    await prisma.pizzaClosing.deleteMany({ where: { unitId: pizzariaId } });
    await lancamentoLegado(frangoId, 2, 100); // venda antiga, sem canal
    await salvarFechamento({ token, substituir: true, contagens: conta(18, 0, 0, 6, 0, 0) });

    const p = await painelDePizzas(pizzariaId, { de: inicioDoPeriodo(hoje, 30), ate: hoje, hoje });
    expect(p.total).toBe(124);
    const t = p.porCanal.find((c) => c.canal === 'TEKNISA')!;
    const i = p.porCanal.find((c) => c.canal === 'IFOOD')!;
    expect(t.total).toBe(18);
    expect(i.total).toBe(6);
    expect(t.pct).toBe(75);
    expect(i.pct).toBe(25);
    expect(t.pct + i.pct).toBe(100);
  });
});
