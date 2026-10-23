import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { criarVinculo, desfazerIgnorar, ignorarSugestao, removerVinculo, type ResultadoVinculo } from '@/lib/comissao/vinculos';

/**
 * Tabela de vínculos da comissão (v1.178.0): criar/confirmar · remover · ignorar
 * sugestão · desfazer ignorar. A regra de quem pode e o escopo por unidade
 * moram em `src/lib/comissao/vinculos.ts`.
 */
const STATUS = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404 } as const;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;
  const b = await req.json().catch(() => ({}));
  const ctx = requestContext(req);
  const acao = String(b?.acao ?? '');
  const dados = { unitId: String(b?.unitId ?? ''), sellerCode: b?.sellerCode, sellerName: b?.sellerName, collaboratorId: String(b?.collaboratorId ?? '') };
  let r: ResultadoVinculo;
  if (acao === 'criar') r = await criarVinculo(user, dados, ctx);
  else if (acao === 'remover') r = await removerVinculo(user, String(b?.id ?? ''), ctx);
  else if (acao === 'ignorar') r = await ignorarSugestao(user, dados, ctx);
  else if (acao === 'desfazerIgnorar') r = await desfazerIgnorar(user, String(b?.id ?? ''), ctx);
  else return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  if (!r.ok) return NextResponse.json({ error: r.message ?? 'Não foi possível concluir.', reason: r.reason }, { status: STATUS[r.reason] });
  return NextResponse.json({ ok: true });
}
