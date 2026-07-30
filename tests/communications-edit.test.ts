import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createCommunication } from '@/lib/communications/create';
import { updateCommunication, setCommunicationPinned } from '@/lib/communications/update';
import { confirmCommunication } from '@/lib/communications/confirm';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `cme${process.pid.toString(36)}`;
let unitX: string, unitY: string;
let authorId: string, otherAuthorId: string, mgrXId: string, mgrYId: string;

const author = (): SessionUser => ({ id: authorId, name: 'Autor', role: 'SUPERVISOR', unitIds: [unitX, unitY], seesAllUnits: false, needsTerms: false });
const other = (): SessionUser => ({ id: otherAuthorId, name: 'Outro', role: 'SUPERVISOR', unitIds: [unitX, unitY], seesAllUnits: false, needsTerms: false });
const mgrX = (): SessionUser => ({ id: mgrXId, name: 'GerX', role: 'MANAGER', unitIds: [unitX], seesAllUnits: false, needsTerms: false });

const commIds: string[] = [];
const future = new Date(Date.now() + 7 * 864e5).toISOString();

async function makeComm(unitIds: string[], extraUserIds: string[] = []): Promise<string> {
  const r = await createCommunication(author(), { title: 'Título original', body: 'Mensagem original', dueAt: future, unitIds, extraUserIds });
  if (!r.ok) throw new Error(`setup falhou: ${r.reason}`);
  commIds.push(r.id);
  return r.id;
}
const recips = (id: string) => prisma.communicationRecipient.findMany({ where: { communicationId: id }, select: { userId: true, status: true } });

beforeAll(async () => {
  const mk = async (c: string) => (await prisma.unit.create({ data: { code: `CME-${c}-${sfx}`, name: `Un ${c}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitX = await mk('X'); unitY = await mk('Y');
  const mkUser = async (n: string, role: 'SUPERVISOR' | 'MANAGER') => (await prisma.user.create({ data: { name: n, email: `${sfx}-${n}@ex.com`, role, passwordHash: 'x' } })).id;
  authorId = await mkUser('autor', 'SUPERVISOR');
  otherAuthorId = await mkUser('outro', 'SUPERVISOR');
  mgrXId = await mkUser('gerx', 'MANAGER');
  mgrYId = await mkUser('gery', 'MANAGER');
  await prisma.unitMembership.create({ data: { userId: mgrXId, unitId: unitX } });
  await prisma.unitMembership.create({ data: { userId: mgrYId, unitId: unitY } });
});

afterAll(async () => {
  await prisma.communication.deleteMany({ where: { id: { in: commIds } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [mgrXId, mgrYId] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitX, unitY] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [authorId, otherAuthorId, mgrXId, mgrYId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Edição de comunicados', () => {
  it('só o autor edita (outro supervisor = FORBIDDEN)', async () => {
    const id = await makeComm([unitX]);
    const r = await updateCommunication(other(), id, { title: 'hack' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('mudar só metadados (prioridade) com confirmação NÃO zera o OK', async () => {
    const id = await makeComm([unitX]);
    await confirmCommunication(mgrX(), id);
    const r = await updateCommunication(author(), id, { priority: 'URGENT' });
    expect(r.ok && r.applied).toBe(true);
    const rs = await recips(id);
    expect(rs.find((x) => x.userId === mgrXId)?.status).toBe('CONFIRMED');
  });

  it('mudar o TEXTO com confirmação: prévia pede confirmação e, confirmada, zera os OKs', async () => {
    const id = await makeComm([unitX]);
    await confirmCommunication(mgrX(), id);
    const preview = await updateCommunication(author(), id, { body: 'Mensagem NOVA' });
    expect(preview.ok && preview.applied === false && preview.needsConfirm).toBe(true);
    if (preview.ok && !preview.applied) expect(preview.summary.resetOks).toBe(1);
    // ainda não aplicou
    expect((await recips(id)).find((x) => x.userId === mgrXId)?.status).toBe('CONFIRMED');
    const applied = await updateCommunication(author(), id, { body: 'Mensagem NOVA', confirm: true });
    expect(applied.ok && applied.applied).toBe(true);
    expect((await recips(id)).find((x) => x.userId === mgrXId)?.status).toBe('PENDING');
  });

  it('adicionar destinatário: entra como PENDING e o que permanece mantém o OK (texto igual)', async () => {
    const id = await makeComm([unitX]);
    await confirmCommunication(mgrX(), id);
    const r = await updateCommunication(author(), id, { unitIds: [unitX, unitY] });
    expect(r.ok && r.applied).toBe(true);
    if (r.ok && r.applied) { expect(r.summary.added).toBe(1); expect(r.summary.resetOks).toBe(0); }
    const rs = await recips(id);
    expect(rs.find((x) => x.userId === mgrXId)?.status).toBe('CONFIRMED'); // permaneceu
    expect(rs.find((x) => x.userId === mgrYId)?.status).toBe('PENDING');   // novo
  });

  it('remover destinatário confirmado: prévia avisa e, confirmada, apaga a linha (sai da meta)', async () => {
    const id = await makeComm([unitX, unitY]);
    await confirmCommunication(mgrX(), id);
    const preview = await updateCommunication(author(), id, { unitIds: [unitY] });
    expect(preview.ok && preview.applied === false).toBe(true);
    if (preview.ok && !preview.applied) expect(preview.summary.removedConfirmed).toBe(1);
    const applied = await updateCommunication(author(), id, { unitIds: [unitY], confirm: true });
    expect(applied.ok && applied.applied).toBe(true);
    const rs = await recips(id);
    expect(rs.some((x) => x.userId === mgrXId)).toBe(false); // linha apagada
    expect(rs.length).toBe(1);
  });

  it('alvo vazio → NO_RECIPIENTS', async () => {
    const id = await makeComm([unitX]);
    const r = await updateCommunication(author(), id, { unitIds: [], extraUserIds: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_RECIPIENTS');
  });

  it('fixar/desafixar: só o autor; alterna pinned sem resetar', async () => {
    const id = await makeComm([unitX]);
    await confirmCommunication(mgrX(), id);
    const forbidden = await setCommunicationPinned(other(), id, true);
    expect(forbidden.ok).toBe(false);
    const r = await setCommunicationPinned(author(), id, true);
    expect(r.ok).toBe(true);
    const c = await prisma.communication.findUnique({ where: { id }, select: { pinned: true } });
    expect(c?.pinned).toBe(true);
    expect((await recips(id)).find((x) => x.userId === mgrXId)?.status).toBe('CONFIRMED'); // não resetou
  });
});
