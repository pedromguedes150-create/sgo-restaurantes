import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { criarModelo, editarModelo, vincularCargos, listarModelos, funcoesSemModelo, cargosDoRh } from '@/lib/people/avaliacao-modelos';

/** GET — modelos, cargos do RH e funções sem modelo (para a tela de Configurações). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const [modelos, semModelo, cargos] = await Promise.all([listarModelos(), funcoesSemModelo(), cargosDoRh()]);
  return NextResponse.json({ modelos, semModelo, cargos });
}

/**
 * POST { acao: 'criar' | 'editar' | 'vincular', … }
 *  - criar:    { name, managerial?, especificos: [{label, weight}×4], cargos?: string[] }
 *  - editar:   { id, name?, managerial?, active?, especificos? }  (critério/peso diferente = versão nova)
 *  - vincular: { id, cargos: string[] }  (substitui o conjunto; cargo de outro modelo passa para este)
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  if (!b?.acao) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);
  const especificos = Array.isArray(b.especificos) ? b.especificos.map((e: { label?: unknown; weight?: unknown; key?: unknown }) => ({ label: String(e?.label ?? ''), weight: Number(e?.weight), key: e?.key ? String(e.key) : undefined })) : undefined;
  const cargos = Array.isArray(b.cargos) ? b.cargos.map((c: unknown) => String(c)) : undefined;

  let r;
  if (b.acao === 'criar') r = await criarModelo(user, { name: String(b.name ?? ''), managerial: !!b.managerial, especificos: especificos ?? [], cargos }, ctx);
  else if (b.acao === 'editar') r = await editarModelo(user, String(b.id ?? ''), { name: b.name == null ? undefined : String(b.name), managerial: b.managerial == null ? undefined : !!b.managerial, active: b.active == null ? undefined : !!b.active, especificos }, ctx);
  else if (b.acao === 'vincular') r = await vincularCargos(user, String(b.id ?? ''), cargos ?? [], ctx);
  else return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });

  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.detalhe ?? (r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Modelo não encontrado' : 'Dados inválidos');
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json(r);
}
