import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { requestContext } from '@/lib/auth/service';
import {
  iniciarConferencia, marcarComanda, finalizarConferencia, cancelarConferencia,
} from '@/lib/commands/sessao';
import type { CommandSessionType, CommandSessionMethod, CommandItemState, CommandItemMethod } from '@prisma/client';

/**
 * Sessão de conferência de comandas.
 *
 * A matriz decide o perfil (`MANUAL`/`COMMANDS` com Editar) e cada função decide
 * o escopo: mesmo com o perfil certo, ninguém confere comanda de unidade que não
 * enxerga.
 */

const STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  INVALID: 400,
  NO_CONFIG: 400,
  JA_EXISTE: 409,
  NAO_ENCONTRADA: 404,
  JA_CONCLUIDA: 409,
  OBSERVATION_REQUIRED: 400,
};

const MSG: Record<string, string> = {
  FORBIDDEN: 'Sem acesso a esta unidade',
  INVALID: 'Dados inválidos',
  NO_CONFIG: 'Configure a faixa de comandas desta unidade antes de conferir',
  JA_EXISTE: 'Já existe uma conferência em andamento deste tipo nesta unidade',
  NAO_ENCONTRADA: 'Conferência não encontrada',
  JA_CONCLUIDA: 'Esta conferência já foi encerrada — o registro é imutável',
  OBSERVATION_REQUIRED: 'Descreva o que houve com as comandas não localizadas',
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const ctx = requestContext(req);
  let r: Awaited<ReturnType<typeof iniciarConferencia>> | Awaited<ReturnType<typeof marcarComanda>>
    | Awaited<ReturnType<typeof finalizarConferencia>> | Awaited<ReturnType<typeof cancelarConferencia>> | undefined;

  if (b.action === 'iniciar') {
    r = await iniciarConferencia(user, {
      unitId: String(b.unitId ?? ''),
      type: String(b.type ?? '') as CommandSessionType,
      method: String(b.method ?? '') as CommandSessionMethod,
      scopeNumbers: Array.isArray(b.scopeNumbers) ? b.scopeNumbers.map(Number) : undefined,
    }, ctx);
  } else if (b.action === 'marcar') {
    r = await marcarComanda(user, {
      sessionId: String(b.sessionId ?? ''),
      number: Number(b.number),
      state: b.state === null ? null : (String(b.state) as CommandItemState),
      method: (String(b.method ?? 'MANUAL') as CommandItemMethod),
    });
  } else if (b.action === 'finalizar') {
    r = await finalizarConferencia(user, { sessionId: String(b.sessionId ?? ''), observation: b.observation }, ctx);
  } else if (b.action === 'cancelar') {
    r = await cancelarConferencia(user, String(b.sessionId ?? ''), ctx);
  }

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    /* `detalhe` existe para a recusa dizer QUAL comanda está fora da faixa, e
       `sessionId` para "já existe uma em andamento" poder oferecer retomá-la em
       vez de só barrar. */
    return NextResponse.json(
      { error: r.detalhe ?? MSG[r.reason] ?? 'Não foi possível', reason: r.reason, sessionId: r.sessionId },
      { status: STATUS[r.reason] ?? 400 },
    );
  }
  return NextResponse.json({ ...r });
}
