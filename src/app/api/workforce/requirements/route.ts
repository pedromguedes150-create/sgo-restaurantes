import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { requestContext } from '@/lib/auth/service';
import { salvarFaixa, apagarFaixa, definirVinteQuatroHoras } from '@/lib/workforce/cobertura';

/**
 * Faixas de necessidade do setor.
 *
 * A matriz decide o perfil (`PEOPLE_MAP` com Editar) e `salvarFaixa`/`apagarFaixa`
 * decidem o escopo: mesmo com o perfil certo, ninguém cadastra faixa de setor de
 * unidade que não enxerga.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const ctx = requestContext(req);
  const r = b.action === 'salvar'
    ? await salvarFaixa(user, {
      sectorId: String(b.sectorId ?? ''),
      id: b.id ? String(b.id) : undefined,
      startTime: String(b.startTime ?? ''),
      endTime: String(b.endTime ?? ''),
      minPeople: Number(b.minPeople),
    }, ctx)
    : b.action === 'apagar'
      ? await apagarFaixa(user, String(b.id ?? ''), ctx)
      : b.action === '24h'
        ? await definirVinteQuatroHoras(user, {
          sectorId: String(b.sectorId ?? ''),
          ligado: Boolean(b.ligado),
          minPeople: Number(b.minPeople ?? 1),
        }, ctx)
        : null;

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const status: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, CONFLITO: 409, NAO_ENCONTRADO: 404 };
    const msg: Record<string, string> = {
      FORBIDDEN: 'Sem acesso a este setor',
      INVALID: 'Dados inválidos',
      CONFLITO: 'Conflito de horário',
      NAO_ENCONTRADO: 'Faixa não encontrada',
    };
    /* `erro` carrega a frase exata — é ela que cita a faixa conflitante, e sem
       isso a recusa vira "conflito" sem dizer com o quê. */
    return NextResponse.json({ error: r.erro ?? msg[r.reason], reason: r.reason }, { status: status[r.reason] ?? 400 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
