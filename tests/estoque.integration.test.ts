import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { biparCodigo, cadastrarProduto, sugerirSetor, vincularCodigo } from '@/lib/stock/catalogo';
import { lancarEntrada, registrarContagem, tratarLote } from '@/lib/stock/lotes';
import { getEstoqueDaUnidade } from '@/lib/stock/query';
import { criarPedido } from '@/lib/products/pedido';
import { listActiveProducts } from '@/lib/products';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O ESTOQUE, do banco até o número.
 *
 * A matemática da validade e da embalagem está provada em
 * `estoque-validade.test.ts`. Aqui se prova o que depende do banco: a bipagem
 * que NÃO duplica cadastro, o saldo que só muda por declaração, a tratativa que
 * encerra o alerta — e, o mais importante para o resto do SGO, que a origem
 * LOCAL não vaza para a esteira de pedidos da Fábrica/CD.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
/**
 * Prefixo NUMÉRICO para os códigos de barras.
 *
 * Separado do `sfx` de propósito: `sfx` é base36 e tem letras, e código de
 * barras é só dígito — `normalizarCodigoDeBarras` descarta o resto, então um
 * código com letra nunca casaria com o que foi gravado.
 */
const ean = `789${String(process.pid % 10000).padStart(4, '0')}${String(Date.now() % 100000).padStart(5, '0')}`;
let unidade: string;
let outra: string;
let userId: string;
let setorCd: string;

const gerente = (): SessionUser => ({ id: userId, name: 'Gerente Teste', role: 'MANAGER', unitIds: [unidade], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: userId, name: 'Admin Teste', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

/** Hoje + n dias, em 'AAAA-MM-DD'. Os prazos precisam ser relativos ao dia real. */
function emDias(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  unidade = (await prisma.unit.create({ data: { code: `EA-${sfx}`, name: `Estoque A ${sfx}` } })).id;
  outra = (await prisma.unit.create({ data: { code: `EB-${sfx}`, name: `Estoque B ${sfx}` } })).id;
  userId = (await prisma.user.create({ data: { name: 'Gerente Teste', email: `estoque-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  setorCd = (await prisma.cdSector.create({ data: { name: `Setor Estoque ${sfx}` } })).id;
});

beforeEach(async () => {
  await prisma.stockLot.deleteMany({ where: { unitId: { in: [unidade, outra] } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: `EST-${sfx}` } } });
});

afterAll(async () => {
  await prisma.stockLot.deleteMany({ where: { unitId: { in: [unidade, outra] } } });
  await prisma.productRequest.deleteMany({ where: { unitId: { in: [unidade, outra] } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: `EST-${sfx}` } } });
  await prisma.cdSector.delete({ where: { id: setorCd } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unidade, outra] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const criarProduto = (nome: string, over: Record<string, unknown> = {}) =>
  prisma.product.create({ data: { name: `EST-${sfx} ${nome}`, origin: 'LOCAL', category: 'Teste', ...over } });

/* ═══════════════ BIPAGEM E CATÁLOGO ═══════════════ */

describe('Bipar um código', () => {
  it('acha o produto pelo código principal', async () => {
    await criarProduto('Coca 2L', { barcode: `${ean}1` });
    const r = await biparCodigo(`${ean}1`);
    expect(r.achado).toBe('PRODUTO');
    if (r.achado === 'PRODUTO') expect(r.produto.name).toContain('Coca 2L');
  });

  it('acha também pelos códigos VINCULADOS, não só pelo principal', async () => {
    /* É o caso do pedido: o mesmo produto chega com código diferente conforme
       a remessa, e todos precisam levar ao mesmo cadastro. */
    const p = await criarProduto('Arroz', { barcode: `${ean}2` });
    await prisma.productBarcode.create({ data: { productId: p.id, code: `${ean}9` } });
    const r = await biparCodigo(`${ean}9`);
    expect(r.achado).toBe('PRODUTO');
    if (r.achado === 'PRODUTO') expect(r.produto.id).toBe(p.id);
  });

  it('código desconhecido SEM termo é produto novo — não inventa candidato', async () => {
    /* Sugerir "parecidos" sem nada a comparar devolveria lista aleatória, e um
       vínculo errado é pior que um cadastro a mais. */
    await criarProduto('Feijao');
    const r = await biparCodigo('7899999999999');
    expect(r.achado).toBe('NOVO');
  });

  it('código desconhecido COM termo devolve candidatos para o gerente decidir', async () => {
    await criarProduto('Leite Integral 1L');
    const r = await biparCodigo('7899999999998', 'Leite');
    expect(r.achado).toBe('CANDIDATOS');
    if (r.achado === 'CANDIDATOS') expect(r.candidatos.some((c) => c.name.includes('Leite'))).toBe(true);
  });

  it('código não numérico é recusado', async () => {
    expect((await biparCodigo('abc')).achado).toBe('CODIGO_INVALIDO');
  });
});

describe('Vincular um código a um produto existente', () => {
  it('vincula e o código passa a achar o produto', async () => {
    const p = await criarProduto('Agua 500');
    const r = await vincularCodigo(gerente(), p.id, `${ean}5`);
    expect(r.ok).toBe(true);
    expect((await biparCodigo(`${ean}5`)).achado).toBe('PRODUTO');
  });

  it('recusa código que já é de OUTRO produto, e diz de quem', async () => {
    /* O `@unique` do banco recusaria a gravação, mas a mensagem do Postgres não
       diz DE QUEM é o código — e é isso que a pessoa precisa para saber se
       bipou a embalagem errada. */
    const dono = await criarProduto('Suco Uva', { barcode: `${ean}6` });
    const outro = await criarProduto('Suco Laranja');
    const r = await vincularCodigo(gerente(), outro.id, `${ean}6`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('JA_VINCULADO');
      expect(r.message).toContain('Suco Uva');
    }
    expect(dono.id).toBeTruthy();
  });

  it('revincular ao MESMO produto não é erro', async () => {
    const p = await criarProduto('Cafe', { barcode: `${ean}7` });
    await prisma.productBarcode.create({ data: { productId: p.id, code: `${ean}7` } });
    expect((await vincularCodigo(gerente(), p.id, `${ean}7`)).ok).toBe(true);
  });
});

describe('Cadastro pelo gerente', () => {
  it('nasce LOCAL e vale para a rede inteira', async () => {
    const r = await cadastrarProduto(gerente(), { name: `EST-${sfx} Molho X`, codigo: `${ean}8` });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.produto.origin).toBe('LOCAL');
      /* Sem unidade nenhuma no cadastro: quem bipar o mesmo código em qualquer
         unidade acha o mesmo produto. */
      expect((await biparCodigo(`${ean}8`)).achado).toBe('PRODUTO');
    }
  });

  it('fardo SEM quantidade dentro é recusado', async () => {
    /* Com fator ausente, "5 fardos" viraria 5 unidades em silêncio. */
    const r = await cadastrarProduto(gerente(), { name: `EST-${sfx} Agua`, packType: 'FARDO' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('unidades');
  });

  it('recusa cadastrar quando o código já é de outro produto', async () => {
    await criarProduto('Ja existe', { barcode: `${ean}0` });
    const r = await cadastrarProduto(gerente(), { name: `EST-${sfx} Novo`, codigo: `${ean}0` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('JA_VINCULADO');
  });
});

/* ═══════════════ O SETOR DO CD ═══════════════ */

describe('Sugestão de setor', () => {
  it('a regra resolve sem IA: a Coca vai para o setor de bebidas', async () => {
    /* O setor `Setor Estoque <sfx>` do teste não casa com apelido nenhum, mas
       "Bebidas" do seed casa — e é o que prova que o casamento é pelo NOME
       cadastrado, e não por id fixo no código. */
    const s = await sugerirSetor('Coca-Cola 2L');
    if ('fonte' in s) {
      expect(s.fonte).toBe('REGRA');
      expect(s.sectorName.toLowerCase()).toContain('bebida');
      expect(s.porque).toBe('coca cola');
    } else {
      /* Sem setor de bebidas cadastrado, não sugerir é a resposta certa. */
      expect(s.sectorId).toBeNull();
    }
  });

  it('devolve SEMPRE a lista de setores, para a tela oferecer a troca', async () => {
    const s = await sugerirSetor('Peça de reposição sem setor conhecido');
    expect(s.setores.length).toBeGreaterThan(0);
  });

  it('produto que nenhuma regra conhece não recebe palpite', async () => {
    const s = await sugerirSetor('Peça de reposição do fogão industrial');
    /* Sem chave de IA o resultado é `sectorId: null`; com chave, a IA pode
       acertar — as duas respostas são aceitáveis, o que NÃO pode é inventar um
       setor fora do cadastro. */
    if ('fonte' in s) {
      expect(s.setores.some((x) => x.id === s.sectorId)).toBe(true);
    } else {
      expect(s.sectorId).toBeNull();
    }
  });
});

describe('A origem sai do setor', () => {
  it('COM setor confirmado, o produto nasce CD e já é pedível', async () => {
    const r = await cadastrarProduto(gerente(), { name: `EST-${sfx} Com Setor`, cdSectorId: setorCd });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.produto.origin).toBe('CD');
      const lista = await listActiveProducts();
      expect(lista.some((p) => p.id === r.produto.id)).toBe(true);
    }
  });

  it('SEM setor, nasce LOCAL e fica fora da tela de pedido', async () => {
    const r = await cadastrarProduto(gerente(), { name: `EST-${sfx} Sem Setor` });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.produto.origin).toBe('LOCAL');
      const lista = await listActiveProducts();
      expect(lista.some((p) => p.id === r.produto.id)).toBe(false);
    }
  });

  it('NUNCA nasce CD sem setor — é o defeito da v1.94.0', async () => {
    /* Produto do CD sem setor some da fila de TODOS os separadores, sem erro
       nenhum. A origem ser DERIVADA do setor é o que torna esse estado
       inalcançável: não há como a tela pedir CD e esquecer o setor. */
    const semSetor = await prisma.product.findMany({
      where: { name: { startsWith: `EST-${sfx}` }, origin: 'CD', cdSectorId: null },
    });
    expect(semSetor).toHaveLength(0);
  });

  it('setor inexistente é recusado, e não vira produto órfão', async () => {
    const r = await cadastrarProduto(gerente(), { name: `EST-${sfx} Fantasma`, cdSectorId: 'setor-que-nao-existe' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('setor INATIVO também é recusado', async () => {
    /* A fila de um setor desativado não é lida por ninguém. */
    const morto = await prisma.cdSector.create({ data: { name: `Setor Morto ${sfx}`, active: false } });
    const r = await cadastrarProduto(gerente(), { name: `EST-${sfx} Inativo`, cdSectorId: morto.id });
    expect(r.ok).toBe(false);
    await prisma.cdSector.delete({ where: { id: morto.id } });
  });
});

/* ═══════════════ A FÁBRICA/CD NÃO PODE SER AFETADA ═══════════════ */

describe('Origem LOCAL não vaza para a esteira de pedidos', () => {
  it('não aparece no catálogo da tela de pedido', async () => {
    const local = await criarProduto('So Estoque');
    const doCd = await criarProduto('Do CD', { origin: 'CD', cdSectorId: setorCd });
    const lista = await listActiveProducts();
    expect(lista.some((p) => p.id === doCd.id)).toBe(true);
    expect(lista.some((p) => p.id === local.id)).toBe(false);
  });

  it('e nem por chamada direta a criarPedido', async () => {
    /* Filtrar só na tela deixaria a porta aberta: um item local viraria um
       ProductRequest de origem que nenhuma aba trata — invisível para os dois
       lados, como o defeito da v1.94.0. */
    const local = await criarProduto('So Estoque 2');
    const r = await criarPedido(admin(), { unitId: unidade, items: [{ productId: local.id, qty: 3 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('o carrinho misto ainda gera o pedido do CD, ignorando só o local', async () => {
    const local = await criarProduto('So Estoque 3');
    const doCd = await criarProduto('Do CD 2', { origin: 'CD', cdSectorId: setorCd });
    const r = await criarPedido(admin(), { unitId: unidade, items: [{ productId: local.id, qty: 1 }, { productId: doCd.id, qty: 2 }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pedidos).toHaveLength(1);
      expect(r.pedidos[0].origin).toBe('CD');
    }
  });
});

/* ═══════════════ SALDO E LOTES ═══════════════ */

describe('Entrada no estoque', () => {
  it('converte a embalagem: 5 fardos de 12 viram 60 unidades', async () => {
    const p = await criarProduto('Agua Fardo', { packType: 'FARDO', packSize: 12 });
    const r = await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.unidades).toBe(60);
  });

  it('produto que controla validade SEM data é recusado', async () => {
    /* Um lote assim nunca alertaria — e o módulo existe para isso. */
    const p = await criarProduto('Molho', { trackExpiry: true });
    const r = await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('SEM_VALIDADE');
  });

  it('duas entregas do MESMO lote somam, em vez de criar duas linhas', async () => {
    /* Na prateleira é uma pilha só; duas linhas fariam o gerente responder a
       mesma pergunta de validade duas vezes. */
    const p = await criarProduto('Molho 2', { trackExpiry: true });
    const val = emDias(40);
    await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 20, lotCode: '4587', expiresAt: val });
    await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 12, lotCode: '4587', expiresAt: val });

    const lotes = await prisma.stockLot.findMany({ where: { unitId: unidade, productId: p.id } });
    expect(lotes).toHaveLength(1);
    expect(Number(lotes[0].qtyOnHand)).toBe(32);
    expect(Number(lotes[0].qtyReceived)).toBe(32);
  });

  it('lote DIFERENTE do mesmo produto é outra linha, com a sua validade', async () => {
    /* É o ponto do pedido: o mesmo produto chega hoje vencendo em dezembro e na
       próxima entrega vencendo em fevereiro. */
    const p = await criarProduto('Molho 3', { trackExpiry: true });
    await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 20, lotCode: '4587', expiresAt: emDias(40) });
    await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 10, lotCode: '9001', expiresAt: emDias(120) });
    expect(await prisma.stockLot.count({ where: { unitId: unidade, productId: p.id } })).toBe(2);
  });

  it('cada entrada grava um movimento com autor', async () => {
    const p = await criarProduto('Batata');
    const r = await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 7 });
    if (!r.ok) throw new Error('entrada falhou');
    const movs = await prisma.stockMovement.findMany({ where: { lotId: r.lotId } });
    expect(movs).toHaveLength(1);
    expect(movs[0].type).toBe('ENTRY');
    expect(Number(movs[0].qtyAfter)).toBe(7);
    expect(movs[0].createdByName).toBe('Gerente Teste');
  });

  it('quem não alcança a unidade não lança nela', async () => {
    const p = await criarProduto('Fora');
    const r = await lancarEntrada(gerente(), { unitId: outra, productId: p.id, quantidade: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});

describe('Contagem', () => {
  it('SUBSTITUI o saldo, e não soma', async () => {
    const p = await criarProduto('Arroz C', { packType: 'FARDO', packSize: 6 });
    const e = await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 10 }); // 60 un
    if (!e.ok) throw new Error('entrada falhou');
    const r = await registrarContagem(gerente(), e.lotId, 4); // contou 4 fardos
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.unidades).toBe(24);
    const lote = await prisma.stockLot.findUnique({ where: { id: e.lotId } });
    expect(Number(lote!.qtyOnHand)).toBe(24);
    /* O recebido NÃO muda: ele é a referência da pergunta do alerta. */
    expect(Number(lote!.qtyReceived)).toBe(60);
  });

  it('zero é válido — significa que acabou', async () => {
    const p = await criarProduto('Acabou');
    const e = await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 5 });
    if (!e.ok) throw new Error('entrada falhou');
    expect((await registrarContagem(gerente(), e.lotId, 0)).ok).toBe(true);
  });

  it('a diferença fica no movimento — é de onde sai a divergência', async () => {
    const p = await criarProduto('Divergente');
    const e = await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 10 });
    if (!e.ok) throw new Error('entrada falhou');
    await registrarContagem(gerente(), e.lotId, 6);
    const mov = await prisma.stockMovement.findFirst({ where: { lotId: e.lotId, type: 'COUNT' } });
    expect(Number(mov!.qty)).toBe(-4);
    expect(Number(mov!.qtyAfter)).toBe(6);
  });
});

/* ═══════════════ A TRATATIVA ═══════════════ */

describe('A tratativa do alerta', () => {
  async function loteVencendoEm(dias: number, alertDays = 30) {
    const p = await criarProduto(`Trat ${dias}`, { trackExpiry: true, alertDays });
    const e = await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 20, lotCode: '4587', expiresAt: emDias(dias) });
    if (!e.ok) throw new Error('entrada falhou');
    return e.lotId;
  }

  it('o lote em janela aparece como PENDENTE', async () => {
    await loteVencendoEm(5);
    const est = await getEstoqueDaUnidade(gerente(), { unitId: unidade });
    expect(est.pendencias).toHaveLength(1);
    expect(est.pendencias[0].faixa?.chave).toBe('ATENCAO');
  });

  it('"Lote finalizado" zera o saldo, encerra e SOME do alerta', async () => {
    const lotId = await loteVencendoEm(5);
    const r = await tratarLote(gerente(), lotId, 'FINALIZADO');
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.status).toBe('FINISHED'); expect(r.saldo).toBe(0); }

    const est = await getEstoqueDaUnidade(gerente(), { unitId: unidade });
    /* Encerrado não é estoque: sai da lista inteira, não só do alerta. */
    expect(est.linhas.some((l) => l.lotId === lotId)).toBe(false);
  });

  it('"Ainda possui estoque" mantém o lote vivo com o saldo declarado', async () => {
    const lotId = await loteVencendoEm(5);
    const r = await tratarLote(gerente(), lotId, 'AINDA_TEM', { quantidade: 8 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.status).toBe('OPEN'); expect(r.saldo).toBe(8); }
  });

  it('"Ainda possui estoque" SEM quantidade é recusado', async () => {
    /* É a única das quatro em que o lote continua vivo, e um lote vivo sem
       saldo declarado não diz nada a ninguém. */
    const lotId = await loteVencendoEm(5);
    const r = await tratarLote(gerente(), lotId, 'AINDA_TEM');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('responder NÃO repete a pergunta na mesma faixa', async () => {
    const lotId = await loteVencendoEm(5);
    await tratarLote(gerente(), lotId, 'AINDA_TEM', { quantidade: 8 });
    const est = await getEstoqueDaUnidade(gerente(), { unitId: unidade });
    expect(est.pendencias).toHaveLength(0);
    /* Mas continua no estoque e continua em alerta na tela. */
    expect(est.linhas.find((l) => l.lotId === lotId)?.faixa?.chave).toBe('ATENCAO');
  });

  it('descarte e transferência encerram com motivos DIFERENTES', async () => {
    /* A diferença importa: acabar é normal, descartar é perda a somar, e
       transferido é mercadoria que está noutra unidade. */
    const a = await loteVencendoEm(3);
    const b = await loteVencendoEm(4);
    const ra = await tratarLote(gerente(), a, 'DESCARTE', { note: 'estufou' });
    const rb = await tratarLote(gerente(), b, 'TRANSFERIDO');
    if (ra.ok) expect(ra.status).toBe('DISCARDED');
    if (rb.ok) expect(rb.status).toBe('TRANSFERRED');
  });

  it('lote já encerrado não aceita nova tratativa', async () => {
    const lotId = await loteVencendoEm(5);
    await tratarLote(gerente(), lotId, 'FINALIZADO');
    const r = await tratarLote(gerente(), lotId, 'DESCARTE');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ENCERRADO');
  });

  it('lote longe do vencimento NÃO gera pendência', async () => {
    await loteVencendoEm(200);
    const est = await getEstoqueDaUnidade(gerente(), { unitId: unidade });
    expect(est.pendencias).toHaveLength(0);
  });
});

describe('Leitura do estoque', () => {
  it('traz as duas leituras da quantidade', async () => {
    const p = await criarProduto('Agua Leitura', { packType: 'FARDO', packSize: 12 });
    await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 5 });
    const est = await getEstoqueDaUnidade(gerente(), { unitId: unidade });
    expect(est.linhas[0].quantidade).toBe('5 fardos · 60 un');
  });

  it('respeita o escopo de unidade', async () => {
    const p = await criarProduto('Da outra');
    await lancarEntrada(admin(), { unitId: outra, productId: p.id, quantidade: 3 });
    const est = await getEstoqueDaUnidade(gerente());
    expect(est.linhas.some((l) => l.produto.includes('Da outra'))).toBe(false);
  });

  it('ordena por urgência: o que vence antes vem primeiro', async () => {
    const p = await criarProduto('Ordem', { trackExpiry: true });
    await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 1, lotCode: 'B', expiresAt: emDias(20) });
    await lancarEntrada(gerente(), { unitId: unidade, productId: p.id, quantidade: 1, lotCode: 'A', expiresAt: emDias(3) });
    const est = await getEstoqueDaUnidade(gerente(), { unitId: unidade });
    expect(est.linhas.map((l) => l.lotCode)).toEqual(['A', 'B']);
  });
});
