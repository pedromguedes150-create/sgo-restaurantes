import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import * as admin from '@/lib/admin';
import type { AdminResult } from '@/lib/admin';
import { setRolePermission } from '@/lib/permissions';
import { setTrainingWeight } from '@/lib/training';

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
  else if (e === 'template' && a === 'create') r = await admin.createTemplate(user, b, ctx);
  else if (e === 'template' && a === 'update') r = await admin.updateTemplate(user, b.id, b, ctx);
  else if (e === 'template' && a === 'toggle') r = await admin.toggleTemplate(user, b.id, b.active, ctx);
  else if (e === 'template' && a === 'delete') r = await admin.deleteTemplate(user, b.id, ctx);
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
  return NextResponse.json({ ok: true, id: r.id });
}
