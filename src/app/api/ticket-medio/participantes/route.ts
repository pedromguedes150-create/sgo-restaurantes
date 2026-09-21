import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { definirParticipacao, type MotivoDaParticipacao } from '@/lib/ticket-media/participacao';

/** Quais unidades participam do Ticket Médio, valendo a partir de uma competência. */

const STATUS: Record<MotivoDaParticipacao, number> = {
  COMPETENCIA: 400, UNIDADE: 404, SEM_ACESSO: 403, NADA_A_FAZER: 200,
};

const MENSAGEM: Record<MotivoDaParticipacao, string> = {
  COMPETENCIA: 'Competência inválida.',
  UNIDADE: 'Unidade não encontrada.',
  SEM_ACESSO: 'A lista inclui unidade fora do seu acesso.',
  NADA_A_FAZER: 'Nada mudou.',
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;

  const body = await req.json().catch(() => ({}));
  const competencia = String(body.competencia ?? '');
  const participantes = Array.isArray(body.participantes) ? body.participantes.map(String) : [];

  const r = await definirParticipacao(user, { competencia, participantes }, requestContext(req));
  if (!r.ok) {
    const motivo = r.reason ?? 'COMPETENCIA';
    return NextResponse.json({ error: MENSAGEM[motivo], reason: motivo }, { status: STATUS[motivo] });
  }
  return NextResponse.json({ ok: true, ligadas: r.ligadas, desligadas: r.desligadas });
}
