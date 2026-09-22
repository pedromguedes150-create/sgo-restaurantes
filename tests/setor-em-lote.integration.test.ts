import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { aplicarSetores, listarSemSetor } from '@/lib/stock/setor-em-lote';
import { listActiveProducts } from '@/lib/products';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O MUTIRÃO DO SETOR.
 *
 * Produto do CD sem setor some da fila de TODOS os separadores, sem erro
 * nenhum. Corrigir mil e duzentos um a um é o caminho que ninguém termina — daí
 * a aplicação em lote. E é justamente por ser em lote que as conferências
 * importam: um engano aqui sai multiplicado por mil.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let bebidas: string;
let secos: string;
let inativo: string;
let userId: string;

const admin = (): SessionUser => ({ id: userId, name: 'Admin Lote', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false });

const P = `LOTE-${sfx}`;

beforeAll(async () => {
  bebidas = (await prisma.cdSector.create({ data: { name: `Bebidas ${sfx}` } })).id;
  secos = (await prisma.cdSector.create({ data: { name: `Secos ${sfx}` } })).id;
  inativo = (await prisma.cdSector.create({ data: { name: `Congelados ${sfx}`, active: false } })).id;
  userId = (await prisma.user.create({ data: { name: 'Admin Lote', email: `lote-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
});

beforeEach(async () => {
  await prisma.product.deleteMany({ where: { name: { startsWith: P } } });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.cdSector.deleteMany({ where: { id: { in: [bebidas, secos, inativo] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const produto = (nome: string, over: Record<string, unknown> = {}) =>
  prisma.product.create({ data: { name: `${P} ${nome}`, origin: 'CD', category: 'Teste', cdSectorId: null, ...over } });

const meus = <T extends { name: string }>(itens: T[]) => itens.filter((i) => i.name.startsWith(P));

describe('A lista dos órfãos já vem com o setor proposto', () => {
  it('a regra resolve o que reconhece e diz o termo que usou', async () => {
    await produto('Coca-Cola 2L');
    const q = await listarSemSetor(admin());
    const coca = q.itens.find((i) => i.name.includes('Coca-Cola'))!;
    /* Pelo NOME, e não pelo id do setor deste teste: o casamento é com QUALQUER
       setor cadastrado cujo nome carregue o apelido, e o banco de
       desenvolvimento já tem um "Bebidas" do seed. Fixar o id aqui provaria uma
       coisa que o código não promete. */
    expect(coca.sugestaoNome?.toLowerCase()).toContain('bebida');
    expect(coca.porque).toBe('coca cola');
  });

  it('o que a regra não reconhece vem SEM proposta, e não com um chute', async () => {
    await produto('Peça de reposição do fogão');
    const q = await listarSemSetor(admin());
    const item = q.itens.find((i) => i.name.includes('Peça de reposição'))!;
    expect(item.sugestaoId).toBeNull();
  });

  it('conta quantos têm proposta e quantos sobraram', async () => {
    await produto('Coca-Cola 2L');
    await produto('Arroz 5kg');
    await produto('Peça de reposição do fogão');
    const q = await listarSemSetor(admin());
    const eu = meus(q.itens);
    expect(eu.filter((i) => i.sugestaoId).length).toBe(2);
    expect(eu.filter((i) => !i.sugestaoId).length).toBe(1);
  });

  it('produto que JÁ tem setor não entra na lista', async () => {
    await produto('Ja resolvido', { cdSectorId: bebidas });
    const q = await listarSemSetor(admin());
    expect(q.itens.some((i) => i.name.includes('Ja resolvido'))).toBe(false);
  });

  it('produto da FÁBRICA não entra — ele não tem setor de CD por definição', async () => {
    await produto('Da fabrica', { origin: 'FABRICA' });
    const q = await listarSemSetor(admin());
    expect(q.itens.some((i) => i.name.includes('Da fabrica'))).toBe(false);
  });

  it('produto LOCAL não entra — ele não é pedível de propósito', async () => {
    await produto('Compra local', { origin: 'LOCAL' });
    const q = await listarSemSetor(admin());
    expect(q.itens.some((i) => i.name.includes('Compra local'))).toBe(false);
  });
});

describe('Aplicar em lote', () => {
  it('grava os setores e os produtos passam a ser vistos pelo separador', async () => {
    const a = await produto('Coca-Cola 2L');
    const b = await produto('Arroz 5kg');
    const r = await aplicarSetores(admin(), [
      { productId: a.id, cdSectorId: bebidas },
      { productId: b.id, cdSectorId: secos },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicados).toBe(2);

    const depois = await prisma.product.findMany({ where: { id: { in: [a.id, b.id] } }, select: { id: true, cdSectorId: true } });
    expect(depois.find((p) => p.id === a.id)?.cdSectorId).toBe(bebidas);
    expect(depois.find((p) => p.id === b.id)?.cdSectorId).toBe(secos);
    /* E continuam pedíveis: o mutirão não mexe em origem nem em nada mais. */
    const lista = await listActiveProducts();
    expect(lista.some((p) => p.id === a.id)).toBe(true);
  });

  it('NÃO sobrescreve quem já tem setor', async () => {
    /* Alguém pode ter corrigido à mão enquanto a tela estava aberta. A tela
       mandaria a proposta velha e apagaria a correção, em silêncio. */
    const p = await produto('Ja tinha', { cdSectorId: secos });
    const r = await aplicarSetores(admin(), [{ productId: p.id, cdSectorId: bebidas }]);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.aplicados).toBe(0); expect(r.ignorados).toBe(1); }
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.cdSectorId).toBe(secos);
  });

  it('recusa setor INATIVO — a fila dele não é lida por ninguém', async () => {
    const p = await produto('Coca-Cola 2L');
    const r = await aplicarSetores(admin(), [{ productId: p.id, cdSectorId: inativo }]);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.aplicados).toBe(0); expect(r.ignorados).toBe(1); }
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.cdSectorId).toBeNull();
  });

  it('não dá setor a produto LOCAL nem da Fábrica', async () => {
    /* Um LOCAL com setor ficaria com setor E sem ser pedível — um estado que
       não quer dizer nada. */
    const local = await produto('Compra local', { origin: 'LOCAL' });
    const fab = await produto('Da fabrica', { origin: 'FABRICA' });
    const r = await aplicarSetores(admin(), [
      { productId: local.id, cdSectorId: bebidas },
      { productId: fab.id, cdSectorId: bebidas },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicados).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: local.id } }))?.cdSectorId).toBeNull();
  });

  it('CONTA o que ficou de fora — 900 aplicados escondendo 12 recusados seria pior que o erro', async () => {
    const bom = await produto('Coca-Cola 2L');
    const jaTem = await produto('Ja tinha', { cdSectorId: secos });
    const r = await aplicarSetores(admin(), [
      { productId: bom.id, cdSectorId: bebidas },
      { productId: jaTem.id, cdSectorId: bebidas },
      { productId: 'id-que-nao-existe', cdSectorId: bebidas },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.aplicados).toBe(1); expect(r.ignorados).toBe(2); }
  });

  it('lista vazia é recusada, em vez de responder "0 aplicados"', async () => {
    const r = await aplicarSetores(admin(), []);
    expect(r.ok).toBe(false);
  });

  it('gerente não corrige o catálogo da rede', async () => {
    const p = await produto('Coca-Cola 2L');
    const r = await aplicarSetores(gerente(), [{ productId: p.id, cdSectorId: bebidas }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('a Auditoria registra POR SETOR, e não mil linhas de id', async () => {
    /* A linha da auditoria precisa ser legível: "para onde foi cada monte" é o
       que responde a pergunta meses depois. */
    const a = await produto('Coca-Cola 2L');
    const b = await produto('Guarana lata');
    await aplicarSetores(admin(), [
      { productId: a.id, cdSectorId: bebidas },
      { productId: b.id, cdSectorId: bebidas },
    ]);
    const log = await prisma.auditLog.findFirst({
      where: { action: 'PRODUCT_SECTOR_BULK', userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
    const meta = log!.metadata as { aplicados?: number; porSetor?: { setor: string; itens: number }[] };
    expect(meta.aplicados).toBe(2);
    expect(meta.porSetor?.[0].itens).toBe(2);
    expect(meta.porSetor?.[0].setor).toContain('Bebidas');
  });
});
