import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import * as admin from '@/lib/admin';
import type { AdminResult } from '@/lib/admin';
import { setRolePermission } from '@/lib/permissions';
import { setTrainingWeight } from '@/lib/training';
import { setCommunicationWeight } from '@/lib/communications/meta';
import { setGasAlertPct } from '@/lib/gas/query';
import { setChecklistToleranceMin } from '@/lib/tasks/tolerance';
import { setHourlyRate, addHoliday, deleteHoliday } from '@/lib/freelancer/pricing';
import type { DayType } from '@prisma/client';
import { createChecklistModel, updateChecklistModel, toggleChecklistModel, deleteChecklistModel, createTemplatesFromModels } from '@/lib/checklist-models';

/**
 * Dispatch único dos cadastros administrativos (Configurações).
 * body: { entity, action, ...data }. Tudo restrito a ADMIN (checado na lib).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const b = await req.json().catch(() => null);
  if (!b?.entity || !b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r: AdminResult | undefined;
  const e = b.entity as string;
  const a = b.action as string;

  if (e === 'unit' && a === 'create') r = await admin.createUnit(user, b, ctx);
  else if (e === 'unit' && a === 'update') r = await admin.updateUnit(user, b.id, b, ctx);
  else if (e === 'unit' && a === 'delete') r = await admin.deleteUnit(user, b.id, ctx);
  else if (e === 'user' && a === 'create') r = await admin.createUser(user, b, ctx);
  else if (e === 'user' && a === 'update') r = await admin.updateUser(user, b.id, b, ctx);
  else if (e === 'user' && a === 'toggle') r = await admin.toggleUser(user, b.id, b.active, ctx);
  else if (e === 'user' && a === 'delete') r = await admin.deleteUser(user, b.id, ctx);
  else if (e === 'user' && a === 'setUnits') r = await admin.setUserUnits(user, b.id, b.unitIds ?? [], ctx);
  else if (e === 'commandSequence' && a === 'create') r = await admin.createCommandSequence(user, b, ctx);
  else if (e === 'commandSequence' && a === 'update') r = await admin.updateCommandSequence(user, b.id, b, ctx);
  else if (e === 'commandSequence' && a === 'delete') r = await admin.deleteCommandSequence(user, b.id, ctx);
  else if (e === 'occType' && a === 'create') r = await admin.createOccType(user, b, ctx);
  else if (e === 'occType' && a === 'update') r = await admin.updateOccType(user, b.id, b, ctx);
  else if (e === 'occType' && a === 'toggle') r = await admin.toggleOccType(user, b.id, b.active, ctx);
  else if (e === 'occType' && a === 'delete') r = await admin.deleteOccType(user, b.id, ctx);
  else if (e === 'occCategory' && a === 'create') r = await admin.createOccCategory(user, b, ctx);
  else if (e === 'occCategory' && a === 'update') r = await admin.updateOccCategory(user, b.id, b, ctx);
  else if (e === 'occCategory' && a === 'toggle') r = await admin.toggleOccCategory(user, b.id, b.active, ctx);
  else if (e === 'occCategory' && a === 'delete') r = await admin.deleteOccCategory(user, b.id, ctx);
  else if (e === 'wasteCategory' && a === 'create') r = await admin.createWasteCategory(user, b, ctx);
  else if (e === 'wasteCategory' && a === 'update') r = await admin.updateWasteCategory(user, b.id, b, ctx);
  else if (e === 'wasteCategory' && a === 'toggle') r = await admin.toggleWasteCategory(user, b.id, b.active, ctx);
  else if (e === 'wasteCategory' && a === 'delete') r = await admin.deleteWasteCategory(user, b.id, ctx);
  else if (e === 'template' && a === 'create') r = await admin.createTemplate(user, b, ctx);
  else if (e === 'template' && a === 'seedExamples') r = await admin.seedExampleChecklists(user, b.unitId, Array.isArray(b.names) ? b.names : undefined, ctx);
  else if (e === 'template' && a === 'update') r = await admin.updateTemplate(user, b.id, b, ctx);
  else if (e === 'template' && a === 'toggle') r = await admin.toggleTemplate(user, b.id, b.active, ctx);
  else if (e === 'template' && a === 'delete') r = await admin.deleteTemplate(user, b.id, ctx, { force: Boolean(b.force) });
  else if (e === 'template' && a === 'setUnits') r = await admin.setTemplateUnits(user, b.id, b.unitIds ?? [], ctx);
  else if (e === 'template' && a === 'duplicate') r = await admin.duplicateTemplate(user, b.id, ctx);
  else if (e === 'template' && a === 'fromModels') r = await createTemplatesFromModels(user, b.unitId, Array.isArray(b.modelIds) ? b.modelIds : [], ctx);
  else if (e === 'checklistModel' && a === 'create') r = await createChecklistModel(user, b, ctx);
  else if (e === 'checklistModel' && a === 'update') r = await updateChecklistModel(user, b.id, b, ctx);
  else if (e === 'checklistModel' && a === 'toggle') r = await toggleChecklistModel(user, b.id, b.active, ctx);
  else if (e === 'checklistModel' && a === 'delete') r = await deleteChecklistModel(user, b.id, ctx);
  else if (e === 'freelancer' && a === 'create') r = await admin.createFreelancer(user, b, ctx);
  else if (e === 'freelancer' && a === 'update') r = await admin.updateFreelancer(user, b.id, b, ctx);
  else if (e === 'freelancer' && a === 'toggle') r = await admin.toggleFreelancer(user, b.id, b.active, ctx);
  else if (e === 'freelancer' && a === 'delete') r = await admin.deleteFreelancer(user, b.id, ctx);
  else if (e === 'miscType' && a === 'create') r = await admin.createMiscType(user, b, ctx);
  else if (e === 'miscType' && a === 'update') r = await admin.updateMiscType(user, b.id, b, ctx);
  else if (e === 'miscType' && a === 'toggle') r = await admin.toggleMiscType(user, b.id, b.active, ctx);
  else if (e === 'miscType' && a === 'delete') r = await admin.deleteMiscType(user, b.id, ctx);
  else if (e === 'delegation' && a === 'create') r = await admin.createDelegation(user, b, ctx);
  else if (e === 'delegation' && a === 'delete') r = await admin.deleteDelegation(user, b.id, ctx);
  else if (e === 'permission' && a === 'set') r = await setRolePermission(user, b, ctx);
  else if (e === 'training' && a === 'setWeight') r = await setTrainingWeight(user, Number(b.weight));
  else if (e === 'communication' && a === 'setWeight') r = await setCommunicationWeight(user, Number(b.weight));
  else if (e === 'gas' && a === 'setAlertPct') r = await setGasAlertPct(user, Number(b.pct));
  else if (e === 'checklistTolerance' && a === 'set') r = await setChecklistToleranceMin(user, Number(b.minutes), ctx);
  else if (e === 'freelancerRate' && a === 'set') r = await setHourlyRate(user, b.unitId, b.dayType as DayType, Number(b.value), ctx);
  else if (e === 'holiday' && a === 'add') r = await addHoliday(user, b.date, b.name, ctx);
  else if (e === 'holiday' && a === 'delete') r = await deleteHoliday(user, b.id, ctx);

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, CONFLICT: 409, BLOCKED: 409 };
    const msg =
      r.reason === 'FORBIDDEN' ? 'Apenas o Administrador' :
      r.reason === 'CONFLICT' ? 'Já existe um registro com esses dados' :
      r.reason === 'BLOCKED' ? 'Não é possível excluir: há histórico/registros vinculados. Inative em vez de excluir.' :
      'Dados inválidos';
    return NextResponse.json({ error: msg, reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id, created: (r as { created?: number }).created });
}
