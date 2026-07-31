import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createChecklistForm, saveField, updateChecklistForm } from '@/lib/checklist-forms/config';
import { getPublicChecklist, submitChecklist } from '@/lib/checklist-forms/public';
import { generateDailyTasksForUnit } from '@/lib/tasks/generate';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `ckf${process.pid.toString(36)}`;
let unitId: string, adminId: string, managerId: string, collabId: string, otherCollabId: string;

const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const manager = (): SessionUser => ({ id: managerId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const u = await prisma.unit.create({ data: { code: `CKF-${sfx}`, name: 'Un Fichas', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = u.id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `${sfx}-a@ex.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  managerId = (await prisma.user.create({ data: { name: 'Ger', email: `${sfx}-g@ex.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  const c = await prisma.collaborator.create({ data: { name: 'Funcionário A', units: { create: { unitId } } } });
  collabId = c.id;
  const oc = await prisma.collaborator.create({ data: { name: 'Fora da Unidade' } }); // sem CollaboratorUnit
  otherCollabId = oc.id;
});

afterAll(async () => {
  await prisma.checklistSubmission.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.taskInstance.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.taskTemplate.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [collabId, otherCollabId] } } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId] } } }).catch(() => {});
  await prisma.$disconnect();
});

async function buildFicha(): Promise<{ id: string; token: string; numId: string; selId: string }> {
  const c = await createChecklistForm(admin(), { unitId, title: 'Ficha de Massas' });
  if (!c.ok) throw new Error('create falhou');
  const num = await saveField(admin(), c.id, { kind: 'NUMBER', label: 'Qtd ao iniciar', required: true });
  const sel = await saveField(admin(), c.id, { kind: 'SELECT', label: 'Tamanho', options: ['380g', '300g'], required: true });
  await saveField(admin(), c.id, { kind: 'SECTION', label: 'Conferência' });
  await saveField(admin(), c.id, { kind: 'BOOLEAN', label: 'Validade conferida' });
  if (!num.ok || !sel.ok) throw new Error('saveField falhou');
  const t = await prisma.taskTemplate.findUnique({ where: { id: c.id }, select: { publicToken: true } });
  return { id: c.id, token: t!.publicToken!, numId: num.id, selId: sel.id };
}

describe('Fichas por link (checklist configurável) — PR1 backend', () => {
  it('gerente sem CHECKLIST_FORMS não cria ficha; admin cria (deliveryMode=LINK, entersMeta=false, com token)', async () => {
    const forbidden = await createChecklistForm(manager(), { unitId, title: 'X' });
    expect(forbidden.ok).toBe(false);
    const c = await createChecklistForm(admin(), { unitId, title: 'Ficha Y' });
    expect(c.ok).toBe(true);
    if (c.ok) {
      const t = await prisma.taskTemplate.findUnique({ where: { id: c.id } });
      expect(t?.deliveryMode).toBe('LINK');
      expect(t?.entersMeta).toBe(false);
      expect(t?.publicToken).toBeTruthy();
    }
  });

  it('SELECT exige opções; a ficha aceita os tipos de campo', async () => {
    const c = await createChecklistForm(admin(), { unitId, title: 'Tipos' });
    if (!c.ok) throw new Error();
    const bad = await saveField(admin(), c.id, { kind: 'SELECT', label: 'Sem opções', options: [] });
    expect(bad.ok).toBe(false);
    const good = await saveField(admin(), c.id, { kind: 'SELECT', label: 'Com opções', options: ['A', 'B'] });
    expect(good.ok).toBe(true);
  });

  it('ficha-LINK NÃO gera instância diária (diário/meta intactos)', async () => {
    const { id } = await buildFicha();
    const before = await prisma.taskInstance.count({ where: { templateId: id } });
    await generateDailyTasksForUnit({ id: unitId, timezone: 'America/Sao_Paulo', cutoffHour: 4 }, '2026-07-30');
    const after = await prisma.taskInstance.count({ where: { templateId: id } });
    expect(before).toBe(0);
    expect(after).toBe(0);
  });

  it('getPublicChecklist expõe só o necessário + funcionários da unidade; null se o link estiver desligado', async () => {
    const { id, token } = await buildFicha();
    const pub = await getPublicChecklist(token);
    expect(pub).not.toBeNull();
    expect(pub!.unitName).toBe('Un Fichas');
    expect(pub!.collaborators.some((c) => c.id === collabId)).toBe(true);
    expect(pub!.fields.length).toBe(4);

    await updateChecklistForm(admin(), id, { linkEnabled: false });
    expect(await getPublicChecklist(token)).toBeNull();
  });

  it('envio: honeypot descarta; funcionário deve ser da unidade; obrigatórios e SELECT validados; sucesso grava snapshot', async () => {
    const { token, numId, selId } = await buildFicha();

    // honeypot preenchido → finge sucesso, não grava
    const hp = await submitChecklist({ token, collaboratorId: collabId, answers: {}, honeypot: 'bot' });
    expect(hp.ok).toBe(true);

    // funcionário fora da unidade
    const wrongCollab = await submitChecklist({ token, collaboratorId: otherCollabId, answers: { [numId]: 10, [selId]: '380g' } });
    expect(wrongCollab.ok).toBe(false);

    // obrigatório faltando
    const missing = await submitChecklist({ token, collaboratorId: collabId, answers: { [selId]: '380g' } });
    expect(missing.ok).toBe(false);

    // opção inválida no SELECT
    const badOpt = await submitChecklist({ token, collaboratorId: collabId, answers: { [numId]: 10, [selId]: 'XPTO' } });
    expect(badOpt.ok).toBe(false);

    // sucesso
    const ok = await submitChecklist({ token, collaboratorId: collabId, answers: { [numId]: 94, [selId]: '380g' }, ip: '10.0.0.1' });
    expect(ok.ok).toBe(true);
    const subs = await prisma.checklistSubmission.findMany({ where: { collaboratorId: collabId } });
    expect(subs.length).toBeGreaterThanOrEqual(1);
    const answers = subs[subs.length - 1].answers as { itemId: string; value: unknown }[];
    expect(answers.find((a) => a.itemId === numId)?.value).toBe(94);

    // throttle: segundo envio no mesmo IP em seguida é barrado
    const throttled = await submitChecklist({ token, collaboratorId: collabId, answers: { [numId]: 1, [selId]: '300g' }, ip: '10.0.0.1' });
    expect(throttled.ok).toBe(false);
    if (!throttled.ok) expect(throttled.reason).toBe('THROTTLED');
  });
});
