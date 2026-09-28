import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createOccurrence } from '@/lib/occurrences/create';
import { closeOccurrence } from '@/lib/occurrences/close';
import { ensureMaintenanceCategories, DEFAULT_MAINTENANCE_CATEGORIES } from '@/lib/occurrences/maintenance-categories';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let unitId: string;
let mgrId: string;
let supId: string;
let typeId: string;
let catId: string;
let catId2: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `OCC-${sfx}`, name: 'U Occ', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  mgrId = (await prisma.user.create({ data: { name: 'M', email: `occm-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'S', email: `occs-${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrId, unitId }, { userId: supId, unitId }] });
  const type = await prisma.occurrenceType.create({ data: { code: `T-${sfx}`, name: 'Tipo Teste' } });
  typeId = type.id;
  catId = (await prisma.occurrenceCategory.create({ data: { typeId, name: 'Cat A' } })).id;
  catId2 = (await prisma.occurrenceCategory.create({ data: { typeId, name: 'Cat B' } })).id;
});

afterAll(async () => {
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.occurrenceType.delete({ where: { id: typeId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Ocorrências (Módulo 6)', () => {
  it('numera sequencialmente por unidade', async () => {
    const a = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId2, gravity: 'LOW', description: 'um' });
    const b = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId2, gravity: 'LOW', description: 'dois' });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.number).toBe(a.number + 1);
  });

  it('marca reincidência (mesmo tipo+categoria <30 dias)', async () => {
    const first = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId, gravity: 'MEDIUM', description: 'primeira' });
    const second = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId, gravity: 'MEDIUM', description: 'repetida' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok) expect(first.isRecurrence).toBe(false);
    if (second.ok) expect(second.isRecurrence).toBe(true);
  });

  it('gerente NÃO pode encerrar; supervisor pode (com ação corretiva)', async () => {
    const created = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId2, gravity: 'HIGH', description: 'p/ encerrar' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const denied = await closeOccurrence(mgr(), created.id, { justification: 'x', correctiveAction: 'y', reviewDate: new Date() });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('FORBIDDEN');

    const ok = await closeOccurrence(sup(), created.id, { justification: 'apurado', correctiveAction: 'treinamento', reviewDate: new Date('2026-12-01') });
    expect(ok.ok).toBe(true);

    const fresh = await prisma.occurrence.findUnique({ where: { id: created.id } });
    expect(fresh?.status).toBe('CLOSED');
    expect(fresh?.closedById).toBe(supId);
  });

  it('nega criação fora do escopo de unidade', async () => {
    const outsider: SessionUser = { id: mgrId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await createOccurrence(outsider, { unitId, typeId, categoryId: catId, gravity: 'LOW', description: 'fora' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  /**
   * O beco sem saída: um tipo sem NENHUMA categoria cadastrada — era o caso de
   * "Manutenção e obras" em produção — recusava o registro sem explicação,
   * porque a categoria era exigida sempre embora `categoryId` seja opcional no
   * banco. Agora a exigência acompanha o cadastro: se o tipo tem categorias,
   * escolher continua obrigatório; se não tem, registra sem.
   */
  it('registra sem categoria quando o tipo não tem nenhuma cadastrada', async () => {
    const semCat = await prisma.occurrenceType.create({ data: { code: `TSC-${sfx}`, name: 'Tipo Sem Categoria' } });
    try {
      const r = await createOccurrence(mgr(), { unitId, typeId: semCat.id, gravity: 'LOW', description: 'sem categoria' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const fresh = await prisma.occurrence.findUnique({ where: { id: r.id } });
        expect(fresh?.categoryId).toBeNull();
        expect(fresh?.categoryName).toBeNull();
        expect(fresh?.typeName).toBe('Tipo Sem Categoria');
      }
    } finally {
      await prisma.occurrence.deleteMany({ where: { typeId: semCat.id } });
      await prisma.occurrenceType.delete({ where: { id: semCat.id } }).catch(() => {});
    }
  });

  it('continua exigindo categoria quando o tipo TEM categorias', async () => {
    const r = await createOccurrence(mgr(), { unitId, typeId, gravity: 'LOW', description: 'faltou categoria' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('semeia categorias só em tipo de manutenção que está sem nenhuma', async () => {
    const vazio = await prisma.occurrenceType.create({ data: { code: `MSEED-${sfx}`, name: 'Manutenção Vazia', isMaintenance: true } });
    const jaTem = await prisma.occurrenceType.create({ data: { code: `MTEM-${sfx}`, name: 'Manutenção Configurada', isMaintenance: true } });
    await prisma.occurrenceCategory.create({ data: { typeId: jaTem.id, name: 'Só esta' } });
    try {
      await ensureMaintenanceCategories();

      const doVazio = await prisma.occurrenceCategory.findMany({ where: { typeId: vazio.id }, orderBy: { order: 'asc' } });
      expect(doVazio.length).toBe(DEFAULT_MAINTENANCE_CATEGORIES.length);
      expect(doVazio[0].name).toBe('Elétrica');
      expect(doVazio.at(-1)?.name).toBe('Outros');

      // Quem já tinha lista própria NÃO é tocado — é a guarda que importa.
      const doOutro = await prisma.occurrenceCategory.findMany({ where: { typeId: jaTem.id } });
      expect(doOutro.length).toBe(1);
      expect(doOutro[0].name).toBe('Só esta');

      // Idempotente: rodar de novo não duplica.
      await ensureMaintenanceCategories();
      const depois = await prisma.occurrenceCategory.count({ where: { typeId: vazio.id } });
      expect(depois).toBe(DEFAULT_MAINTENANCE_CATEGORIES.length);
    } finally {
      await prisma.occurrenceType.deleteMany({ where: { id: { in: [vazio.id, jaTem.id] } } }).catch(() => {});
    }
  });

  it('não semeia em tipo que NÃO é de manutenção', async () => {
    const comum = await prisma.occurrenceType.create({ data: { code: `MNAO-${sfx}`, name: 'Tipo Comum', isMaintenance: false } });
    try {
      await ensureMaintenanceCategories();
      expect(await prisma.occurrenceCategory.count({ where: { typeId: comum.id } })).toBe(0);
    } finally {
      await prisma.occurrenceType.delete({ where: { id: comum.id } }).catch(() => {});
    }
  });

  it('recusa categoria que pertence a outro tipo', async () => {
    const outro = await prisma.occurrenceType.create({ data: { code: `TO-${sfx}`, name: 'Outro Tipo' } });
    const catDoOutro = await prisma.occurrenceCategory.create({ data: { typeId: outro.id, name: 'Cat do outro' } });
    try {
      const r = await createOccurrence(mgr(), { unitId, typeId, categoryId: catDoOutro.id, gravity: 'LOW', description: 'trocada' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('INVALID');
    } finally {
      await prisma.occurrenceType.delete({ where: { id: outro.id } }).catch(() => {});
    }
  });
});

describe('Tratamento em lote (v1.128.0)', () => {
  it('marca várias como Em andamento, pula a encerrada e audita cada uma com quem/quando', async () => {
    const { markManyInProgress, responsaveisDoAndamento } = await import('@/lib/occurrences/lote');
    const nova = async (d: string) => { const r = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId, gravity: 'LOW', description: d }); if (!r.ok) throw new Error('setup'); return r.id; };
    const a = await nova('lote a'); const b = await nova('lote b'); const fechada = await nova('lote fechada');
    await closeOccurrence(sup(), fechada, { justification: 'j', correctiveAction: 'c', reviewDate: new Date() });

    const gerente = await markManyInProgress(mgr(), [a, b]);
    expect(gerente.feitas).toEqual([]); // gerente não trata

    const r = await markManyInProgress(sup(), [a, b, fechada, a, 'nao-existe']);
    expect(r.feitas.sort()).toEqual([a, b].sort());
    expect(r.puladas.map((p) => p.reason).sort()).toEqual(['ALREADY_CLOSED', 'NOT_FOUND']);
    const rows = await prisma.occurrence.findMany({ where: { id: { in: [a, b, fechada] } }, select: { id: true, status: true } });
    expect(rows.find((x) => x.id === a)?.status).toBe('IN_PROGRESS');
    expect(rows.find((x) => x.id === fechada)?.status).toBe('CLOSED');

    // Quem marcou e quando, lido da Auditoria — sem coluna nova.
    const quem = await responsaveisDoAndamento([a, b, fechada]);
    expect(quem.get(a)?.nome).toBe('S');
    expect(quem.get(a)?.em).toBeInstanceOf(Date);
    expect(quem.has(fechada)).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: 'OCC_IN_PROGRESS', entityId: { in: [a, b] } } })).toBe(2);
  });

  it('reclassifica várias com a MESMA regra da individual: tipo com categorias exige categoria', async () => {
    const { reclassifyMany, reclassifyOccurrence } = await import('@/lib/occurrences/lote');
    const tipoSem = await prisma.occurrenceType.create({ data: { code: `TS-${sfx}`, name: 'Tipo sem categoria' } });
    try {
      const nova = async (d: string) => { const r = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId, gravity: 'LOW', description: d }); if (!r.ok) throw new Error('setup'); return r.id; };
      const a = await nova('reclass a'); const b = await nova('reclass b');

      const semCategoria = await reclassifyMany(sup(), [a, b], { typeId });
      expect(semCategoria.feitas).toEqual([]);
      expect(semCategoria.puladas.every((p) => p.reason === 'INVALID')).toBe(true);

      const ok = await reclassifyMany(sup(), [a, b], { typeId: tipoSem.id });
      expect(ok.feitas.sort()).toEqual([a, b].sort());
      const rows = await prisma.occurrence.findMany({ where: { id: { in: [a, b] } }, select: { typeName: true, categoryId: true, categoryName: true } });
      expect(rows.every((x) => x.typeName === 'Tipo sem categoria' && x.categoryId === null && x.categoryName === null)).toBe(true);

      // A individual é a mesma função — e o gerente não reclassifica.
      expect((await reclassifyOccurrence(mgr(), a, { typeId, categoryId: catId })).ok).toBe(false);
      expect((await reclassifyOccurrence(sup(), a, { typeId, categoryId: catId2 })).ok).toBe(true);
      expect(await prisma.auditLog.count({ where: { action: 'OCCURRENCE_RECLASSIFIED', entityId: { in: [a, b] } } })).toBe(3);
    } finally {
      await prisma.occurrence.updateMany({ where: { typeId: tipoSem.id }, data: { typeId, typeName: 'Tipo Teste' } });
      await prisma.occurrenceType.delete({ where: { id: tipoSem.id } });
    }
  });

  it('busca e ordem no banco: "antigas" inverte e a busca por texto acha pela descrição', async () => {
    const { listOccurrences } = await import('@/lib/occurrences/query');
    const r = await createOccurrence(mgr(), { unitId, typeId, categoryId: catId, gravity: 'CRITICAL', description: `xyzzy-${sfx} placa promocional` });
    expect(r.ok).toBe(true);
    const busca = await listOccurrences(sup(), { q: `xyzzy-${sfx}` });
    expect(busca.total).toBe(1);
    const recentes = await listOccurrences(sup(), { ordem: 'recentes', limit: 200 });
    const antigas = await listOccurrences(sup(), { ordem: 'antigas', limit: 200 });
    expect(antigas.items.map((o) => o.id)).toEqual([...recentes.items.map((o) => o.id)].reverse());
    const porGravidade = await listOccurrences(sup(), { ordem: 'gravidade', limit: 200 });
    expect(porGravidade.items[0].gravity).toBe('CRITICAL');
  });
});
