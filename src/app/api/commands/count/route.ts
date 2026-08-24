import { NextResponse } from 'next/server';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { submitCount } from '@/lib/commands/count';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  NO_CONFIG: { msg: 'Sequência de comandas não configurada para esta unidade', status: 400 },
  OBSERVATION_REQUIRED: { msg: 'Observação obrigatória quando há comandas ausentes', status: 422 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.unitId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const result = await submitCount(
    user,
    {
      unitId: body.unitId,
      operationalDate: body.operationalDate,
      allPresent: Boolean(body.allPresent),
      absentNumbers: Array.isArray(body.absentNumbers) ? body.absentNumbers.map(Number) : [],
      /* A grade manda o que está MARCADO e o servidor calcula o ausente.
         Repassar undefined (e não []) é essencial: é `undefined` que diz ao
         submitCount "esta contagem não usou grade" e "esta contagem é
         completa". Uma lista vazia significaria "nada marcado" — toda a
         sequência viraria falta. */
      presentNumbers: Array.isArray(body.presentNumbers) ? body.presentNumbers.map(Number) : undefined,
      inUseNumbers: Array.isArray(body.inUseNumbers) ? body.inUseNumbers.map(Number) : undefined,
      scopeNumbers: Array.isArray(body.scopeNumbers) ? body.scopeNumbers.map(Number) : undefined,
      observation: body.observation,
    },
    requestContext(req),
  );

  if (!result.ok) {
    return reasonResponse(REASONS, result.reason);
  }
  return NextResponse.json({ ok: true, absent: result.absent, newDivergences: result.newDivergences });
}
