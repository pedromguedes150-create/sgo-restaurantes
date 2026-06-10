import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { completeTask } from '@/lib/tasks/complete';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveEvidence, UploadError } from '@/lib/uploads';

const REASON_MESSAGES: Record<string, { msg: string; status: number }> = {
  NOT_FOUND: { msg: 'Tarefa não encontrada', status: 404 },
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  EVIDENCE_REQUIRED: { msg: 'Esta tarefa exige foto de evidência', status: 422 },
  ALREADY_DONE: { msg: 'Tarefa já concluída por outro usuário', status: 409 },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const instanceId = params.id;

  // Evidência opcional via multipart/form-data
  let evidencePath: string | undefined;
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const inst = await prisma.taskInstance.findUnique({
      where: { id: instanceId },
      select: { unitId: true },
    });
    if (!inst) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    if (!canAccessUnit(user, inst.unitId)) {
      return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
    }
    const form = await req.formData();
    const file = form.get('evidence');
    if (file instanceof File && file.size > 0) {
      try {
        evidencePath = await saveEvidence(file, inst.unitId, instanceId);
      } catch (e) {
        if (e instanceof UploadError) {
          return NextResponse.json({ error: e.message }, { status: 422 });
        }
        throw e;
      }
    }
  }

  const result = await completeTask(instanceId, user, { evidencePath }, requestContext(req));

  if (!result.ok) {
    const r = REASON_MESSAGES[result.reason];
    return NextResponse.json({ error: r.msg, reason: result.reason }, { status: r.status });
  }

  return NextResponse.json({ ok: true });
}
