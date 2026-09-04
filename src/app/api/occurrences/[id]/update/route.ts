import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';

/**
 * Fases de andamento + reclassificação da ocorrência (16/07).
 * POST { action: 'addUpdate', text } — registra uma fase do andamento.
 * POST { action: 'reclassify', typeId, categoryId } — muda tipo/categoria
 *   (move para as sub-abas Manutenção/TI conforme o tipo). Só Supervisor/Admin/CEO:
 *   a regra sempre foi essa no papel, mas até a auditoria de 04/09 a rota não
 *   conferia o perfil — qualquer um da unidade reclassificava.
 */
const RECLASSIFICA: readonly string[] = ['SUPERVISOR', 'ADMIN', 'CEO'];
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (user.role === 'FINANCE') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  const occ = await prisma.occurrence.findUnique({ where: { id: params.id }, select: { unitId: true, status: true, number: true } });
  if (!occ) return NextResponse.json({ error: 'Ocorrência não encontrada' }, { status: 404 });
  if (!canAccessUnit(user, occ.unitId)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  if (b.action === 'addUpdate') {
    const text = String(b.text ?? '').trim();
    if (!text || text.length > 2000) return NextResponse.json({ error: 'Escreva o andamento' }, { status: 400 });
    if (occ.status === 'CLOSED') return NextResponse.json({ error: 'Ocorrência já encerrada' }, { status: 400 });
    await prisma.occurrenceUpdate.create({ data: { occurrenceId: params.id, text, authorId: user.id, authorName: user.name } });
    await audit({ userId: user.id, unitId: occ.unitId, action: 'OCCURRENCE_UPDATE_ADDED', module: 'OCCURRENCES', entity: 'occurrence', entityId: params.id, metadata: { number: occ.number }, ...ctx });
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'reclassify') {
    if (!RECLASSIFICA.includes(user.role)) return NextResponse.json({ error: 'Apenas Supervisor/Admin reclassificam' }, { status: 403 });
    const type = b.typeId ? await prisma.occurrenceType.findUnique({ where: { id: String(b.typeId) }, include: { categories: true } }) : null;
    if (!type) return NextResponse.json({ error: 'Escolha o tipo' }, { status: 400 });
    const ativas = type.categories.filter((c) => c.active);
    const category = b.categoryId ? ativas.find((c) => c.id === String(b.categoryId)) : null;
    // O tipo novo TEM categorias? Então escolher uma é obrigatório aqui também.
    if (!category && ativas.length > 0) {
      return NextResponse.json({ error: 'Escolha a categoria do novo tipo' }, { status: 400 });
    }
    await prisma.occurrence.update({
      where: { id: params.id },
      data: {
        typeId: type.id, typeName: type.name,
        // Escreve SEMPRE, inclusive null. Antes o campo era omitido quando não
        // havia categoria, e a categoria ANTIGA continuava colada no tipo novo
        // — dava "Manutenção e obras — Atendimento" na tela, uma categoria que
        // não pertence ao tipo. Só deu para corrigir porque `categoryName`
        // deixou de ser NOT NULL nesta mudança.
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
      },
    });
    await audit({ userId: user.id, unitId: occ.unitId, action: 'OCCURRENCE_RECLASSIFIED', module: 'OCCURRENCES', entity: 'occurrence', entityId: params.id, metadata: { number: occ.number, type: type.name, category: category?.name }, ...ctx });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
