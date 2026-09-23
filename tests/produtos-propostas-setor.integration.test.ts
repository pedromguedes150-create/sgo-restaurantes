import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  decidirProposta, aprovarTodasPendentes, listarPropostasPendentes, contarPropostasPendentes, gerarPropostas,
} from '@/lib/products/propostas-setor';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PROPOSTAS DE SETOR POR IA — a IA sugere, o COORDENADOR decide.
 *
 * O que estes casos travam:
 *  - aprovar APLICA o setor no produto (e propaga para os pedidos abertos);
 *  - editar antes de aprovar aplica o setor do Coordenador, não o proposto;
 *  - rejeitar NÃO muda o produto;
 *  - uma proposta já decidida não é decidida de novo;
 *  - só quem mantém o catálogo decide (Coordenação inclusa; gerente não).
 *
 * A GERAÇÃO em si chama a IA e no ambiente de teste não há chave — então aqui
 * cobrimos a permissão e o caminho "sem chave"; as propostas para os casos de
 * decisão são criadas direto no banco, que é como a IA as deixaria.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let bebidas: string;
let secos: string;
let adminId: string;
let coordId: string;
let unitId: string;

const admin = (): SessionUser => ({ id: adminId, name: 'Admin Prop', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const coord = (): SessionUser => ({ id: coordId, name: 'Coord Prop', role: 'COORDINATOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const gerente = (): SessionUser => ({ id: adminId, name: 'Gerente', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false });

const P = `PROP-${sfx}`;

beforeAll(async () => {
  bebidas = (await prisma.cdSector.create({ data: { name: `Bebidas ${sfx}` } })).id;
  secos = (await prisma.cdSector.create({ data: { name: `Secos ${sfx}` } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin Prop', email: `prop-a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  coordId = (await prisma.user.create({ data: { name: 'Coord Prop', email: `prop-c-${sfx}@t.local`, role: 'COORDINATOR', passwordHash: 'x' } })).id;
  unitId = (await prisma.unit.create({ data: { code: `PP-${sfx}`, name: 'Unidade Prop', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
});

beforeEach(async () => {
  await prisma.productSectorProposal.deleteMany({ where: { product: { name: { startsWith: P } } } });
  await prisma.productRequestItem.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.productRequest.deleteMany({ where: { createdByName: P } });
  await prisma.product.deleteMany({ where: { name: { startsWith: P } } });
});

afterAll(async () => {
  await prisma.productSectorProposal.deleteMany({ where: { product: { name: { startsWith: P } } } });
  await prisma.productRequestItem.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.productRequest.deleteMany({ where: { createdByName: P } });
  await prisma.product.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.cdSector.deleteMany({ where: { id: { in: [bebidas, secos] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, coordId] } } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.$disconnect();
});

async function produtoCd(nome: string, over: Record<string, unknown> = {}) {
  return prisma.product.create({ data: { name: `${P} ${nome}`, origin: 'CD', category: 'Teste', cdSectorId: null, ...over } });
}
async function proposta(productId: string, proposedSectorId: string | null, over: Record<string, unknown> = {}) {
  return prisma.productSectorProposal.create({
    data: { productId, proposedSectorId, proposedSectorName: proposedSectorId ? 'Bebidas' : null, status: 'PENDING', createdByName: 'IA', ...over },
  });
}

describe('Decidir uma proposta', () => {
  it('APROVAR aplica o setor proposto no produto e marca a proposta APROVADA', async () => {
    const p = await produtoCd('Coca-Cola');
    const prop = await proposta(p.id, bebidas);
    const r = await decidirProposta(coord(), prop.id, { aprovar: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicado).toBe(true);

    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.cdSectorId).toBe(bebidas);
    const depois = await prisma.productSectorProposal.findUnique({ where: { id: prop.id } });
    expect(depois?.status).toBe('APPROVED');
    expect(depois?.finalSectorId).toBe(bebidas);
    expect(depois?.reviewedById).toBe(coordId);
  });

  it('EDITAR antes de aprovar aplica o setor do Coordenador, não o proposto', async () => {
    const p = await produtoCd('Arroz');
    const prop = await proposta(p.id, bebidas); // IA propôs Bebidas, mas é Secos
    const r = await decidirProposta(coord(), prop.id, { aprovar: true, cdSectorId: secos });
    expect(r.ok).toBe(true);
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.cdSectorId).toBe(secos);
    const depois = await prisma.productSectorProposal.findUnique({ where: { id: prop.id } });
    expect(depois?.finalSectorId).toBe(secos);
  });

  it('REJEITAR não muda o produto e marca a proposta REJEITADA', async () => {
    const p = await produtoCd('Duvidoso');
    const prop = await proposta(p.id, bebidas);
    const r = await decidirProposta(coord(), prop.id, { aprovar: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aplicado).toBe(false);
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.cdSectorId).toBeNull();
    expect((await prisma.productSectorProposal.findUnique({ where: { id: prop.id } }))?.status).toBe('REJECTED');
  });

  it('aprovar reclassifica um produto que JÁ tinha setor (sobrescreve)', async () => {
    const p = await produtoCd('Reclassificar', { cdSectorId: secos });
    const prop = await proposta(p.id, bebidas);
    await decidirProposta(coord(), prop.id, { aprovar: true });
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.cdSectorId).toBe(bebidas);
  });

  it('proposta já decidida não é decidida de novo', async () => {
    const p = await produtoCd('Uma vez só');
    const prop = await proposta(p.id, bebidas);
    await decidirProposta(coord(), prop.id, { aprovar: true });
    const r = await decidirProposta(coord(), prop.id, { aprovar: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('JA_DECIDIDA');
  });

  it('aprovar sem setor proposto e sem edição é recusado (nada a aplicar)', async () => {
    const p = await produtoCd('Sem sugestão');
    const prop = await proposta(p.id, null);
    const r = await decidirProposta(coord(), prop.id, { aprovar: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('SEM_SETOR');
    // mas dá para aprovar informando o setor na hora
    const r2 = await decidirProposta(coord(), prop.id, { aprovar: true, cdSectorId: bebidas });
    expect(r2.ok).toBe(true);
  });

  it('gerente não decide o catálogo da rede', async () => {
    const p = await produtoCd('Coca-Cola');
    const prop = await proposta(p.id, bebidas);
    const r = await decidirProposta(gerente(), prop.id, { aprovar: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});

describe('Aprovar propaga para os pedidos abertos', () => {
  it('o item sem setor de um pedido aberto do CD recebe o setor aprovado', async () => {
    const p = await produtoCd('Guaraná');
    const pedido = await prisma.productRequest.create({
      data: { unitId, origin: 'CD', number: 1, status: 'ENVIADO_CD', createdById: adminId, createdByName: P, items: [] },
    });
    const item = await prisma.productRequestItem.create({
      data: { requestId: pedido.id, productId: p.id, name: `${P} Guaraná`, cdSectorId: null, qtyRequested: '2' },
    });
    const prop = await proposta(p.id, bebidas);
    await decidirProposta(admin(), prop.id, { aprovar: true });

    const depois = await prisma.productRequestItem.findUnique({ where: { id: item.id } });
    expect(depois?.cdSectorId).toBe(bebidas);
  });
});

describe('A fila e o lote', () => {
  it('lista e conta só as PENDENTES', async () => {
    const a = await produtoCd('Pendente A');
    const b = await produtoCd('Pendente B');
    const c = await produtoCd('Já aprovada');
    await proposta(a.id, bebidas);
    await proposta(b.id, secos);
    const propC = await proposta(c.id, bebidas);
    await decidirProposta(admin(), propC.id, { aprovar: true });

    const lista = (await listarPropostasPendentes()).filter((x) => x.productName.startsWith(P));
    expect(lista.length).toBe(2);
    expect(await contarPropostasPendentes()).toBeGreaterThanOrEqual(2);
    // a lista traz o setor atual e o proposto para o Coordenador conferir
    const linha = lista.find((x) => x.productName.includes('Pendente A'))!;
    expect(linha.proposedSectorId).toBe(bebidas);
    expect(linha.setorAtualNome).toBeNull();
  });

  it('APROVAR TODAS aplica cada uma com o setor proposto', async () => {
    const a = await produtoCd('Lote A');
    const b = await produtoCd('Lote B');
    await proposta(a.id, bebidas);
    await proposta(b.id, secos);
    const r = await aprovarTodasPendentes(admin());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aprovadas).toBeGreaterThanOrEqual(2);
    expect((await prisma.product.findUnique({ where: { id: a.id } }))?.cdSectorId).toBe(bebidas);
    expect((await prisma.product.findUnique({ where: { id: b.id } }))?.cdSectorId).toBe(secos);
  });

  it('APROVAR TODAS ignora (e conta) proposta sem setor proposto', async () => {
    const a = await produtoCd('Com setor');
    const b = await produtoCd('Sem setor proposto');
    await proposta(a.id, bebidas);
    await proposta(b.id, null);
    const r = await aprovarTodasPendentes(admin());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.aprovadas).toBeGreaterThanOrEqual(1);
      expect(r.ignoradas).toBeGreaterThanOrEqual(1);
    }
    // a sem setor continua PENDENTE (não foi decidida)
    expect((await prisma.product.findUnique({ where: { id: b.id } }))?.cdSectorId).toBeNull();
  });
});

describe('Gerar propostas', () => {
  it('gerente não gera propostas', async () => {
    const r = await gerarPropostas(gerente(), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('sem chave de IA no ambiente, devolve configured=false sem criar proposta', async () => {
    // Este teste vale quando o ambiente não tem ANTHROPIC_API_KEY (o caso do CI).
    if (process.env.ANTHROPIC_API_KEY) return;
    const p = await produtoCd('Qualquer');
    const r = await gerarPropostas(admin(), [p.id]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.configured).toBe(false);
      expect(r.criadas).toBe(0);
    }
    expect(await prisma.productSectorProposal.count({ where: { productId: p.id } })).toBe(0);
  });
});
