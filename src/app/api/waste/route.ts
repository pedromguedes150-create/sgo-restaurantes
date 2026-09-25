import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveWasteEntry, type WasteItemInput, type WasteEntryPhotoInput } from '@/lib/waste/save';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveEvidence, UploadError } from '@/lib/uploads';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  EVIDENCE_REQUIRED: { msg: 'Esta tarefa exige a foto da balança', status: 422 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  let unitId = '';
  let operationalDate: string | undefined;
  let observation: string | undefined;
  let items: WasteItemInput[] = [];
  let evidencePath: string | undefined;
  let entryPhotos: WasteEntryPhotoInput[] = [];

  // Códigos de tipo fixo que podem receber foto por procedimento.
  const PHOTO_CODES = ['SS_ALMOCO', 'SS_JANTAR', 'PROD_ALMOCO', 'PROD_JANTAR'] as const;

  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      unitId = String(form.get('unitId') ?? '');
      operationalDate = (form.get('operationalDate') as string) || undefined;
      observation = (form.get('observation') as string) || undefined;
      items = JSON.parse(String(form.get('items') ?? '[]'));
      const file = form.get('evidence');
      if (file instanceof File && file.size > 0) {
        if (!unitId || !canAccessUnit(user, unitId)) {
          return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
        }
        evidencePath = await saveEvidence(file, unitId, `waste-${operationalDate ?? 'hoje'}`);
      }
      // Fotos por procedimento: evidence_SS_ALMOCO, evidence_SS_JANTAR, etc.
      for (const code of PHOTO_CODES) {
        const pf = form.get(`evidence_${code}`);
        if (pf instanceof File && pf.size > 0) {
          if (!unitId || !canAccessUnit(user, unitId)) {
            return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
          }
          const path = await saveEvidence(pf, unitId, `waste-${code}-${operationalDate ?? 'hoje'}`);
          entryPhotos.push({ typeCode: code, path });
        }
      }
    } else {
      const body = await req.json();
      unitId = body.unitId;
      operationalDate = body.operationalDate;
      observation = body.observation;
      items = body.items ?? [];
    }
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  const result = await saveWasteEntry(
    user,
    { unitId, operationalDate, items, observation, evidencePath, entryPhotos: entryPhotos.length ? entryPhotos : undefined },
    requestContext(req),
  );

  if (!result.ok) {
    return reasonResponse(REASONS, result.reason);
  }

  return NextResponse.json({ ok: true, alerts: result.alerts, operationalDate: result.operationalDate });
}
