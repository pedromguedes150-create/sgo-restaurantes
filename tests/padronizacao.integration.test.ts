import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { createPrepStandard, updatePrepStandard, setPrepStandardPhoto, setPrepStandardStatus } from '@/lib/preparo/write';
import { getPrepStandard, listPrepStandards, getPrepHistory, vizinhosDaFicha } from '@/lib/preparo/query';
import { lerFichaDePreparo } from '@/lib/ai/preparo';
import { env } from '@/lib/env';

/**
 * PADRONIZAÇÃO DE PREPARO — o que se prova no banco: só o Admin grava (e isso
 * vale por fora da tela); código repetido nunca sobrescreve calado; o
 * histórico diz campo/antes/depois; trocar a foto não toca em mais nada;
 * ficha inativa some para quem não é Admin; a IA é inerte sem chave.
 */

const sfx = `pp${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let adminId: string; let supId: string;
const codigo = (n: number) => `${sfx}-${n}`;

/* Usuário DE VERDADE no banco, não um id inventado: `createdById` e a
   Auditoria têm FK para `users`, e um id falso faria a gravação falhar em
   silêncio (lição de rh-sync e collaborator-units). */
const admin = (): SessionUser => ({ id: adminId, name: 'Daniel Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const supervisor = (): SessionUser => ({ id: supId, name: 'Supervisora', role: 'SUPERVISOR', unitIds: [], seesAllUnits: false, needsTerms: false });

const ficha = (n: number, over: Record<string, unknown> = {}) => ({
  name: `Pão c/ Linguiça ${sfx}-${n}`, code: codigo(n), category: `Lanches ${sfx}`,
  preparationMethod: 'Montar na ordem.', generalNotes: null,
  items: [
    { ingredientName: 'Pão Francês', quantity: 1, unit: 'Unid', weightGrams: 65, notes: null },
    { ingredientName: 'Linguiça', quantity: 2, unit: 'fatias', weightGrams: 120, notes: 'Fatia na largura da espátula' },
    { ingredientName: 'Saco para Lanche', quantity: 1, unit: 'Unid', weightGrams: null, notes: null },
  ],
  ...over,
});

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: 'Daniel Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
});

beforeEach(async () => {
  await prisma.prepStandard.deleteMany({ where: { code: { startsWith: `${sfx}-` } } });
});

afterAll(async () => {
  await prisma.prepStandard.deleteMany({ where: { code: { startsWith: `${sfx}-` } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, supId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supId] } } });
  await prisma.$disconnect();
});

describe('Quem grava', () => {
  it('o Supervisor não cria, não edita, não troca foto nem inativa — mesmo chamando a lib direto', async () => {
    expect(await createPrepStandard(supervisor(), { dados: ficha(1) })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    const r = await createPrepStandard(admin(), { dados: ficha(1) });
    if (!r.ok) throw new Error('não criou');
    expect(await updatePrepStandard(supervisor(), r.id, ficha(1, { name: 'X' }))).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await setPrepStandardPhoto(supervisor(), r.id, 'uploads/preparo/x.jpg')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await setPrepStandardStatus(supervisor(), r.id, 'INACTIVE')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await getPrepHistory(supervisor(), r.id)).toEqual([]);
  });

  it('o Admin cria: itens na ordem, "Ficha criada" no histórico, Auditoria com o código', async () => {
    const r = await createPrepStandard(admin(), { dados: ficha(2), sourceFilePath: 'uploads/preparo/fonte-1.pdf' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = await getPrepStandard(admin(), r.id);
    expect(f?.items.map((i) => i.ingredientName)).toEqual(['Pão Francês', 'Linguiça', 'Saco para Lanche']);
    expect(f?.items[1]).toMatchObject({ quantity: 2, unit: 'fatias', weightGrams: 120, notes: 'Fatia na largura da espátula' });
    expect(f?.items[2].weightGrams).toBeNull();
    expect(f?.createdByName).toBe('Daniel Admin');
    expect(f?.sourceFilePath).toBe('uploads/preparo/fonte-1.pdf');
    const h = await getPrepHistory(admin(), r.id);
    expect(h.map((l) => l.field)).toEqual(['Ficha criada']);
    expect(h[0].newValue).toBe('Importada de arquivo');
    const a = await prisma.auditLog.findFirst({ where: { action: 'PREP_STANDARD_CREATE', entityId: r.id } });
    expect((a?.metadata as { code?: string })?.code).toBe(codigo(2));
  });

  it('dados inválidos são recusados apontando o campo', async () => {
    const r = await createPrepStandard(admin(), { dados: ficha(3, { items: [{ ingredientName: 'A', quantity: 'duas' }] }) });
    expect(r).toMatchObject({ ok: false, reason: 'INVALID', campo: 'items.0.quantity' });
  });
});

describe('Código repetido nunca sobrescreve calado', () => {
  it('segunda ficha com o mesmo código ATIVO → CODIGO_EXISTE, devolvendo a existente; nada é criado', async () => {
    const a = await createPrepStandard(admin(), { dados: ficha(4) });
    if (!a.ok) throw new Error('não criou');
    const b = await createPrepStandard(admin(), { dados: ficha(4, { name: 'Outra' }) });
    expect(b).toMatchObject({ ok: false, reason: 'CODIGO_EXISTE', existente: { id: a.id, code: codigo(4) } });
    expect(await prisma.prepStandard.count({ where: { code: codigo(4) } })).toBe(1);
  });

  it('"Criar nova ficha": a nova entra ATIVA e a antiga vira INATIVA, com o motivo no histórico das duas', async () => {
    const a = await createPrepStandard(admin(), { dados: ficha(5) });
    if (!a.ok) throw new Error('não criou');
    const b = await createPrepStandard(admin(), { dados: ficha(5, { name: 'Versão 2' }), codigoRepetido: 'NOVA' });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect((await prisma.prepStandard.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('INACTIVE');
    expect((await prisma.prepStandard.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('ACTIVE');
    const hAntiga = await getPrepHistory(admin(), a.id);
    expect(hAntiga[0]).toMatchObject({ field: 'Situação', oldValue: 'Ativa' });
    expect(hAntiga[0].newValue).toContain(b.id);
    const hNova = await getPrepHistory(admin(), b.id);
    expect(hNova.some((l) => l.field === 'Situação' && l.newValue?.includes(a.id))).toBe(true);
    /* Para o funcionário só existe a nova. */
    const lista = await listPrepStandards(supervisor());
    expect(lista.filter((f) => f.code === codigo(5)).map((f) => f.id)).toEqual([b.id]);
  });

  it('inativa não bloqueia: o código volta a ficar livre; reativar com outra ativa de mesmo código é barrado', async () => {
    const a = await createPrepStandard(admin(), { dados: ficha(6) });
    if (!a.ok) throw new Error('não criou');
    expect((await setPrepStandardStatus(admin(), a.id, 'INACTIVE')).ok).toBe(true);
    const b = await createPrepStandard(admin(), { dados: ficha(6, { name: 'Nova' }) });
    expect(b.ok).toBe(true);
    expect(await setPrepStandardStatus(admin(), a.id, 'ACTIVE')).toMatchObject({ ok: false, reason: 'CODIGO_EXISTE' });
  });
});

describe('Editar', () => {
  it('o histórico registra campo, antes e depois: "Linguiça · Peso: 120 g → 110 g"; itens são substituídos na ordem nova', async () => {
    const r = await createPrepStandard(admin(), { dados: ficha(7) });
    if (!r.ok) throw new Error('não criou');
    const novo = ficha(7);
    (novo.items[1] as { weightGrams: number }).weightGrams = 110;
    novo.items = [novo.items[1], novo.items[0]]; // tira o saco, inverte os dois
    const u = await updatePrepStandard(admin(), r.id, novo);
    expect(u).toMatchObject({ ok: true, mudancas: 2 });
    const h = await getPrepHistory(admin(), r.id);
    expect(h.map((l) => `${l.field}: ${l.oldValue ?? '—'} → ${l.newValue ?? '—'}`)).toEqual(expect.arrayContaining([
      'Linguiça · Peso: 120 g → 110 g',
      'Ingrediente removido: Saco para Lanche · 1 Unid → —',
    ]));
    expect(h[0].userName).toBe('Daniel Admin');
    const f = await getPrepStandard(admin(), r.id);
    expect(f?.items.map((i) => i.ingredientName)).toEqual(['Linguiça', 'Pão Francês']);
    expect(f?.updatedByName).toBe('Daniel Admin');
  });

  it('salvar sem mudar nada não gera histórico; mudar o código para um já ativo é recusado', async () => {
    const a = await createPrepStandard(admin(), { dados: ficha(8) });
    const b = await createPrepStandard(admin(), { dados: ficha(9) });
    if (!a.ok || !b.ok) throw new Error('não criou');
    expect(await updatePrepStandard(admin(), a.id, ficha(8))).toMatchObject({ ok: true, mudancas: 0 });
    expect(await getPrepHistory(admin(), a.id)).toHaveLength(1);
    expect(await updatePrepStandard(admin(), a.id, ficha(8, { code: codigo(9) }))).toMatchObject({ ok: false, reason: 'CODIGO_EXISTE', existente: { id: b.id } });
  });
});

describe('Foto', () => {
  it('trocar a foto muda SÓ a foto: itens, código e preparo ficam idênticos; o histórico diz "Foto"', async () => {
    const r = await createPrepStandard(admin(), { dados: ficha(10), imagePath: 'uploads/preparo/foto-a.jpg' });
    if (!r.ok) throw new Error('não criou');
    const antes = await getPrepStandard(admin(), r.id);
    const t = await setPrepStandardPhoto(admin(), r.id, 'uploads/preparo/foto-b.jpg');
    expect(t).toMatchObject({ ok: true, mudancas: 1 });
    const depois = await getPrepStandard(admin(), r.id);
    expect(depois?.imagePath).toBe('uploads/preparo/foto-b.jpg');
    expect({ ...depois, imagePath: null, updatedAt: null, updatedByName: null }).toEqual({ ...antes, imagePath: null, updatedAt: null, updatedByName: null });
    const h = await getPrepHistory(admin(), r.id);
    expect(h[0]).toMatchObject({ field: 'Foto', oldValue: 'uploads/preparo/foto-a.jpg', newValue: 'uploads/preparo/foto-b.jpg' });
    expect((await setPrepStandardPhoto(admin(), r.id, null)).ok).toBe(true);
    expect((await getPrepStandard(admin(), r.id))?.imagePath).toBeNull();
    /* Mesma foto de novo = nada a registrar. */
    expect(await setPrepStandardPhoto(admin(), r.id, null)).toMatchObject({ ok: true, mudancas: 0 });
  });
});

describe('Ver', () => {
  it('ficha INATIVA some para o Supervisor (lista e endereço direto) e segue para o Admin com o filtro', async () => {
    const r = await createPrepStandard(admin(), { dados: ficha(11) });
    if (!r.ok) throw new Error('não criou');
    await setPrepStandardStatus(admin(), r.id, 'INACTIVE');
    expect(await getPrepStandard(supervisor(), r.id)).toBeNull();
    expect((await listPrepStandards(supervisor(), { status: 'ALL' })).some((f) => f.id === r.id)).toBe(false);
    expect(await getPrepStandard(admin(), r.id)).not.toBeNull();
    expect((await listPrepStandards(admin(), { status: 'INACTIVE' })).some((f) => f.id === r.id)).toBe(true);
    expect((await listPrepStandards(admin())).some((f) => f.id === r.id)).toBe(false);
    expect(await setPrepStandardStatus(admin(), r.id, 'INACTIVE')).toMatchObject({ ok: false, reason: 'STATE' });
  });

  it('a lista traz os nomes dos ingredientes (é o que permite buscar por ingrediente) e Anterior/Próximo seguem a ordem do catálogo', async () => {
    const a = await createPrepStandard(admin(), { dados: ficha(12, { name: `A ${sfx}`, category: `Z ${sfx}` }) });
    const b = await createPrepStandard(admin(), { dados: ficha(13, { name: `B ${sfx}`, category: `Z ${sfx}` }) });
    if (!a.ok || !b.ok) throw new Error('não criou');
    const lista = await listPrepStandards(supervisor(), { categoria: `Z ${sfx}` });
    expect(lista.map((f) => f.id)).toEqual([a.id, b.id]);
    expect(lista[0].ingredientes).toEqual(['Pão Francês', 'Linguiça', 'Saco para Lanche']);
    const v = await vizinhosDaFicha(a.id);
    expect(v.nextId).toBe(b.id);
    expect((await vizinhosDaFicha(b.id)).prevId).toBe(a.id);
  });
});

describe('IA', () => {
  it('sem chave é inerte; com chave, formato não suportado é recusado sem ir à rede', async () => {
    const r = await lerFichaDePreparo({ base64: 'AAAA', mediaType: 'text/plain' });
    if (!env.ANTHROPIC_API_KEY) expect(r).toEqual({ configured: false, ok: false });
    else expect(r).toMatchObject({ configured: true, ok: false });
    expect(r.rascunho).toBeUndefined();
  });
});
