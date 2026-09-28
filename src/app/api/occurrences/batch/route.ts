import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { markManyInProgress, reclassifyMany, TRATA_OCORRENCIA } from '@/lib/occurrences/lote';

/**
 * AÇÕES EM LOTE sobre ocorrências (v1.128.0).
 * POST { action: 'progress', ids }                       — marca as selecionadas como Em andamento
 * POST { action: 'reclassify', ids, typeId, categoryId } — reclassifica as selecionadas
 *
 * Não existe "encerrar em lote" de propósito: o encerramento pede justificativa,
 * ação corretiva e data de revisão de CADA ocorrência, e segue individual.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (!TRATA_OCORRENCIA.includes(user.role)) return NextResponse.json({ error: 'Apenas Supervisor/Admin tratam ocorrências em lote' }, { status: 403 });

  const b = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(b?.ids) ? b.ids.filter((x: unknown) => typeof x === 'string') : [];
  if (!b?.action || ids.length === 0) return NextResponse.json({ error: 'Selecione ao menos uma ocorrência' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'progress') {
    const r = await markManyInProgress(user, ids, ctx);
    return NextResponse.json({ ok: true, ...r });
  }
  if (b.action === 'reclassify') {
    if (!b.typeId) return NextResponse.json({ error: 'Escolha o tipo' }, { status: 400 });
    const r = await reclassifyMany(user, ids, { typeId: String(b.typeId), categoryId: b.categoryId ? String(b.categoryId) : null }, ctx);
    /* Tipo com categorias e nenhuma escolhida: NENHUMA muda — devolve o motivo em vez de "0 feitas". */
    if (r.feitas.length === 0 && r.puladas.every((p) => p.reason === 'INVALID')) {
      return NextResponse.json({ error: 'Escolha a categoria do novo tipo' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...r });
  }
  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
