import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import {
  definirHorarioDoGerente,
  lancarFolgaDoGerente,
  apagarFolgaDoGerente,
} from '@/lib/manager-schedule-central';

/**
 * Escala de gerentes — gravação central.
 *
 * A matriz decide o perfil (`guardaDaRota` exige `MANAGER_SCHEDULE / Editar`) e
 * cada função decide o escopo: mesmo com o perfil certo, ninguém lança para
 * gerente de unidade que não enxerga.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const alvo = String(b.userId ?? '');
  let r: { ok: boolean; reason?: string; id?: string } | undefined;

  if (b.action === 'setHorario') {
    r = await definirHorarioDoGerente(user, alvo, {
      weekdays: Array.isArray(b.weekdays) ? b.weekdays : [],
      startTime: b.startTime, endTime: b.endTime, note: b.note,
    });
  } else if (b.action === 'addFolga') {
    r = await lancarFolgaDoGerente(user, alvo, {
      kind: String(b.kind ?? 'FOLGA'),
      startDate: String(b.startDate ?? ''),
      endDate: String(b.endDate ?? ''),
      note: b.note,
    });
  } else if (b.action === 'deleteFolga') {
    r = await apagarFolgaDoGerente(user, String(b.id ?? ''));
  }

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const status: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, OVERLAP: 409 };
    const msg: Record<string, string> = {
      FORBIDDEN: 'Sem permissão para este gerente',
      INVALID: 'Dados inválidos',
      OVERLAP: 'Já existe folga ou férias deste gerente nesse período',
    };
    const reason = r.reason ?? 'INVALID';
    return NextResponse.json({ error: msg[reason] ?? 'Dados inválidos', reason }, { status: status[reason] ?? 400 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
