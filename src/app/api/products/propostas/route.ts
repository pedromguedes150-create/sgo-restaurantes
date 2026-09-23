import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { gerarPropostas, decidirProposta, aprovarTodasPendentes } from '@/lib/products/propostas-setor';

/**
 * Propostas de setor por IA (com aprovação do Coordenador).
 *  - gerar        → roda a IA nos produtos selecionados e cria propostas PENDENTES
 *  - aprovar      → aplica o setor (proposto ou o editado em `cdSectorId`)
 *  - rejeitar     → descarta a proposta, produto fica como está
 *  - aprovarTodas → aprova todas as pendentes com o setor proposto
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'gerar') {
    const ids = Array.isArray(b.productIds) ? b.productIds.map(String) : [];
    const r = await gerarPropostas(user, ids, ctx);
    if (!r.ok) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    return NextResponse.json(r);
  }

  if (b.action === 'aprovar' || b.action === 'rejeitar') {
    const r = await decidirProposta(
      user, String(b.id ?? ''),
      { aprovar: b.action === 'aprovar', cdSectorId: b.cdSectorId ? String(b.cdSectorId) : null },
      ctx,
    );
    if (!r.ok) {
      const status = r.reason === 'FORBIDDEN' ? 403 : r.reason === 'NAO_ENCONTRADO' ? 404 : 400;
      return NextResponse.json({ error: r.message ?? 'Não foi possível decidir a proposta.' }, { status });
    }
    return NextResponse.json({ ok: true, aplicado: r.aplicado });
  }

  if (b.action === 'aprovarTodas') {
    const r = await aprovarTodasPendentes(user, ctx);
    if (!r.ok) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    return NextResponse.json({ ok: true, aprovadas: r.aprovadas, ignoradas: r.ignoradas });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
