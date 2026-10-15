import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { lancarMinhaFolga, apagarMinhaFolga } from '@/lib/manager-schedule-central';

/**
 * Escala de gerentes — a PRÓPRIA folga (v1.170.0).
 *
 * Porta separada da central de propósito: a matriz libera esta rota pelo
 * módulo "Minha folga" (gerente/coordenador), e a função só grava para o
 * PRÓPRIO usuário, a partir de amanhã. Quem tem o Editar da Escala de gerentes
 * continua usando `/api/manager-schedule`, que lança para qualquer gerente.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  let r: { ok: boolean; reason?: string; id?: string } | undefined;
  if (b.action === 'addFolga') {
    r = await lancarMinhaFolga(user, {
      kind: String(b.kind ?? 'FOLGA'), startDate: String(b.startDate ?? ''), endDate: String(b.endDate ?? ''), note: b.note,
    });
  } else if (b.action === 'deleteFolga') {
    r = await apagarMinhaFolga(user, String(b.id ?? ''), b.motivo);
  }

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const status: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, OVERLAP: 409, DATA_PASSADA: 400, NAO_E_SEU: 403, SEM_MOTIVO: 400 };
    const msg: Record<string, string> = {
      FORBIDDEN: 'Só gerente ou coordenador lança a própria folga',
      INVALID: 'Dados inválidos',
      OVERLAP: 'Já existe folga ou férias sua nesse período',
      DATA_PASSADA: 'Só é possível lançar a partir de amanhã — datas passadas e o dia de hoje ficam com a Supervisão',
      NAO_E_SEU: 'Você só apaga o que você mesmo lançou e ainda não aconteceu',
      SEM_MOTIVO: 'Explique o motivo da exclusão (pelo menos 10 caracteres)',
    };
    const reason = r.reason ?? 'INVALID';
    return NextResponse.json({ error: msg[reason] ?? 'Dados inválidos', reason }, { status: status[reason] ?? 400 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
