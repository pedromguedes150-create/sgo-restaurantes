import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { normalizarCodigoDeBarras } from '@/lib/products/sheet';
import { buscarProdutos } from '@/lib/products/busca';
import { sugerirSetorPorRegra, type SetorCadastrado } from '@/lib/stock/setor-sugerido';
import { sugerirSetorPorIA } from '@/lib/ai/produto-setor';
import type { SessionUser } from '@/lib/auth/session';
import type { PackType, ProductOrigin } from '@prisma/client';

/**
 * BIPAR NO ESTOQUE — o catálogo é UM SÓ para a rede inteira.
 *
 * Nenhuma tabela nova: `Product` já é esse catálogo e `ProductBarcode.code` já
 * é `@unique`, o que torna a duplicidade impossível por construção — dois
 * produtos não conseguem responder pelo mesmo código nem que alguém tente.
 *
 * A ORDEM da busca é o desenho: primeiro o determinístico e barato (o código
 * exato), e só depois a semelhança de nome. Sair perguntando à IA logo de cara
 * gastaria tempo e chave numa pergunta que o índice responde em milissegundos,
 * e o gerente está de pé no estoque com o celular na mão.
 */

const podeCadastrar = (user: SessionUser) => ['ADMIN', 'CEO', 'SUPERVISOR', 'MANAGER', 'COORDINATOR'].includes(user.role);

export interface ProdutoDoEstoque {
  id: string;
  name: string;
  category: string;
  measure: string;
  origin: ProductOrigin;
  packType: PackType;
  /** Unidades dentro do fardo/display. */
  packSize: number | null;
  trackExpiry: boolean;
  alertDays: number;
  /** Todos os códigos que respondem por ele (o principal incluído). */
  codigos: string[];
}

export type ResultadoDaBipagem =
  /** O código já aponta para um produto. Segue direto para a quantidade. */
  | { achado: 'PRODUTO'; produto: ProdutoDoEstoque }
  /** Código desconhecido, mas há candidatos parecidos para vincular. */
  | { achado: 'CANDIDATOS'; codigo: string; candidatos: ProdutoDoEstoque[] }
  /** Código desconhecido e nada parecido: é cadastro novo. */
  | { achado: 'NOVO'; codigo: string }
  | { achado: 'CODIGO_INVALIDO' };

const SELECT = {
  id: true, name: true, category: true, measure: true, origin: true,
  packType: true, packSize: true, trackExpiry: true, alertDays: true,
  barcode: true, barcodes: { select: { code: true } },
} as const;

type Linha = {
  id: string; name: string; category: string; measure: string; origin: ProductOrigin;
  packType: PackType; packSize: number | null; trackExpiry: boolean; alertDays: number;
  barcode: string | null; barcodes: { code: string }[];
};

const paraProduto = (p: Linha): ProdutoDoEstoque => ({
  id: p.id, name: p.name, category: p.category, measure: p.measure, origin: p.origin,
  packType: p.packType, packSize: p.packSize, trackExpiry: p.trackExpiry, alertDays: p.alertDays,
  codigos: [...new Set([p.barcode, ...p.barcodes.map((b) => b.code)].filter((c): c is string => Boolean(c)))],
});

/**
 * O que fazer com o código que acabou de ser bipado.
 *
 * `termo` é opcional e vem de quando o gerente já digitou parte do nome: serve
 * para achar candidatos de vínculo. Sem ele, um código novo cai em 'NOVO' — o
 * que está certo, porque sugerir "produtos parecidos" sem nada a comparar
 * devolveria uma lista aleatória, e aceitar um vínculo errado é pior que
 * cadastrar um produto a mais.
 */
export async function biparCodigo(codigoBruto: string, termo?: string): Promise<ResultadoDaBipagem> {
  const codigo = normalizarCodigoDeBarras(codigoBruto);
  if (!codigo) return { achado: 'CODIGO_INVALIDO' };

  /* 1) O código exato — em `barcodes` (a lista) ou no `barcode` principal. */
  const vinculado = await prisma.product.findFirst({
    where: { active: true, OR: [{ barcode: codigo }, { barcodes: { some: { code: codigo } } }] },
    select: SELECT,
  });
  if (vinculado) return { achado: 'PRODUTO', produto: paraProduto(vinculado) };

  /* 2) Semelhança pelo que a pessoa digitou. Nunca vincula sozinho: devolve
        candidatos e quem decide é o gerente, que está com a embalagem na mão. */
  const t = (termo ?? '').trim();
  if (t.length >= 3) {
    const todos = await prisma.product.findMany({ where: { active: true }, select: SELECT });
    const candidatos = buscarProdutos(
      todos.map((p) => ({ ...p, barcodes: p.barcodes.map((b) => b.code) })),
      t,
      8,
    );
    if (candidatos.length > 0) {
      const ids = new Set(candidatos.map((c) => c.id));
      return { achado: 'CANDIDATOS', codigo, candidatos: todos.filter((p) => ids.has(p.id)).map(paraProduto) };
    }
  }
  return { achado: 'NOVO', codigo };
}

export type VincularResult =
  | { ok: true; produto: ProdutoDoEstoque }
  | { ok: false; reason: 'FORBIDDEN' | 'CODIGO_INVALIDO' | 'NAO_ENCONTRADO' | 'JA_VINCULADO'; message?: string };

/**
 * Vincula um código novo a um produto que já existe.
 *
 * É o caminho que impede a duplicidade que o pedido do Pedro nomeia: o mesmo
 * produto chega com código diferente conforme a remessa, e cadastrar de novo
 * criaria dois saldos para a mesma prateleira.
 */
export async function vincularCodigo(user: SessionUser, productId: string, codigoBruto: string): Promise<VincularResult> {
  if (!podeCadastrar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const codigo = normalizarCodigoDeBarras(codigoBruto);
  if (!codigo) return { ok: false, reason: 'CODIGO_INVALIDO' };

  const produto = await prisma.product.findUnique({ where: { id: productId }, select: SELECT });
  if (!produto) return { ok: false, reason: 'NAO_ENCONTRADO' };

  /* Dono anterior: o `@unique` recusaria a gravação, mas a mensagem do banco
     não diz DE QUEM é o código — e é isso que a pessoa precisa saber para
     decidir se bipou a embalagem errada ou se há um cadastro duplicado. */
  const dono = await prisma.product.findFirst({
    where: { OR: [{ barcode: codigo }, { barcodes: { some: { code: codigo } } }] },
    select: { id: true, name: true },
  });
  if (dono) {
    if (dono.id === productId) return { ok: true, produto: paraProduto(produto) };
    return { ok: false, reason: 'JA_VINCULADO', message: `Este código já pertence a "${dono.name}".` };
  }

  await prisma.productBarcode.create({ data: { productId, code: codigo, createdById: user.id } });
  await audit({
    userId: user.id, action: 'STOCK_BARCODE_LINK', module: 'STOCK', entity: 'product', entityId: productId,
    metadata: { codigo, produto: produto.name },
  });
  const atualizado = await prisma.product.findUnique({ where: { id: productId }, select: SELECT });
  return { ok: true, produto: paraProduto(atualizado!) };
}

export interface SugestaoDeSetor {
  sectorId: string;
  sectorName: string;
  fonte: 'REGRA' | 'IA';
  /** O que decidiu — o termo casado, ou o motivo que o modelo deu. */
  porque: string | null;
  /** Todos os setores do cadastro, para a tela oferecer a troca. */
  setores: SetorCadastrado[];
}

/**
 * Em que setor do CD este produto se separa.
 *
 * DUAS CAMADAS, e a ordem importa: a regra determinística resolve o romaneio da
 * rede inteira na hora, de graça e sem chave; a IA entra só no que sobra. O
 * contrário deixaria o cadastro dependente de rede e gastaria segundos numa
 * pergunta que uma tabela responde em microssegundos — com o gerente de pé no
 * estoque.
 *
 * A sugestão NUNCA grava sozinha: ela volta para a tela, que a mostra ao lado
 * da lista completa de setores. Errar o setor manda o item para a fila de um
 * separador que não tem o que fazer com ele.
 */
export async function sugerirSetor(nome: string, categoria?: string | null): Promise<SugestaoDeSetor | { setores: SetorCadastrado[]; sectorId: null }> {
  const setores = await prisma.cdSector.findMany({
    where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true },
  });
  if (setores.length === 0 || !nome.trim()) return { setores, sectorId: null };

  const porRegra = sugerirSetorPorRegra(nome, setores, categoria);
  if (porRegra) {
    return { sectorId: porRegra.sectorId, sectorName: porRegra.sectorName, fonte: 'REGRA', porque: porRegra.termo, setores };
  }

  const porIA = await sugerirSetorPorIA({ nome, categoria, setores });
  if (porIA.ok && porIA.sectorId && porIA.sectorName) {
    return { sectorId: porIA.sectorId, sectorName: porIA.sectorName, fonte: 'IA', porque: porIA.motivo ?? null, setores };
  }
  return { setores, sectorId: null };
}

export interface NovoProdutoInput {
  name: string;
  category?: string;
  measure?: string;
  packType?: string;
  packSize?: number | null;
  trackExpiry?: boolean;
  alertDays?: number;
  codigo?: string | null;
  /** Setor do CD confirmado pelo gerente. Sem ele, o produto nasce LOCAL. */
  cdSectorId?: string | null;
}
export type CadastrarResult =
  | { ok: true; produto: ProdutoDoEstoque }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'JA_VINCULADO'; message?: string };

const MEDIDAS = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'dz'];
const TIPOS: PackType[] = ['UN', 'FARDO', 'DISPLAY'];

/**
 * Cadastro pelo gerente, direto da prateleira.
 *
 * A ORIGEM SAI DO SETOR, e não de uma escolha a mais na tela:
 *
 *  - **Com setor confirmado** → nasce `CD` e já é pedível. É o caso normal: o
 *    SGO sugere ("uma Coca é Bebidas"), o gerente confirma, e o produto entra
 *    no estoque e no catálogo de pedidos de uma vez só.
 *  - **Sem setor** → nasce `LOCAL`, que existe para compra direta da unidade e
 *    NÃO entra na esteira de pedidos.
 *
 * O que não pode acontecer em hipótese nenhuma é nascer `CD` SEM setor: o item
 * sumiria da fila de todos os separadores sem erro nenhum (defeito da v1.94.0).
 * Por isso a decisão é binária e derivada — não há como a tela pedir CD e
 * esquecer o setor.
 */
export async function cadastrarProduto(user: SessionUser, input: NovoProdutoInput): Promise<CadastrarResult> {
  if (!podeCadastrar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const name = input.name?.trim();
  if (!name) return { ok: false, reason: 'INVALID', message: 'Informe o nome do produto.' };

  const codigo = input.codigo ? normalizarCodigoDeBarras(input.codigo) : null;
  if (codigo) {
    const dono = await prisma.product.findFirst({
      where: { OR: [{ barcode: codigo }, { barcodes: { some: { code: codigo } } }] },
      select: { name: true },
    });
    if (dono) return { ok: false, reason: 'JA_VINCULADO', message: `Este código já pertence a "${dono.name}". Vincule a ele em vez de cadastrar de novo.` };
  }

  const packType = TIPOS.includes(String(input.packType) as PackType) ? (input.packType as PackType) : 'UN';
  /* Fardo/display SEM quantidade seria uma embalagem que não se sabe converter:
     o saldo em unidades sairia igual ao número de fardos, calado. */
  const packSize = packType === 'UN' ? null : Math.max(1, Math.trunc(Number(input.packSize) || 0));
  if (packType !== 'UN' && !(packSize && packSize > 1)) {
    return { ok: false, reason: 'INVALID', message: 'Informe quantas unidades vêm dentro do fardo/display.' };
  }

  /* Setor confirmado precisa EXISTIR e estar ativo. Um id solto vindo do corpo
     da requisição criaria o produto apontando para lugar nenhum. */
  let setor: string | null = null;
  if (input.cdSectorId) {
    const achado = await prisma.cdSector.findFirst({ where: { id: input.cdSectorId, active: true }, select: { id: true } });
    if (!achado) return { ok: false, reason: 'INVALID', message: 'Setor do CD inválido ou inativo.' };
    setor = achado.id;
  }

  const produto = await prisma.product.create({
    data: {
      name,
      origin: setor ? 'CD' : 'LOCAL',
      cdSectorId: setor,
      category: input.category?.trim() || 'Geral',
      measure: MEDIDAS.includes(String(input.measure)) ? String(input.measure) : 'un',
      packType,
      packSize,
      trackExpiry: Boolean(input.trackExpiry),
      alertDays: Math.min(365, Math.max(1, Math.trunc(Number(input.alertDays) || 30))),
      barcode: codigo,
      ...(codigo ? { barcodes: { create: { code: codigo, createdById: user.id } } } : {}),
    },
    select: SELECT,
  });
  await audit({
    userId: user.id, action: 'STOCK_PRODUCT_CREATE', module: 'STOCK', entity: 'product', entityId: produto.id,
    metadata: { nome: name, codigo, packType, packSize, origem: 'LOCAL' },
  });
  return { ok: true, produto: paraProduto(produto) };
}
