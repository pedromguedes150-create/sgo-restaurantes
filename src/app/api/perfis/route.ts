import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import {
  alternarPerfil,
  criarPerfil,
  definirPermissaoDoPerfil,
  excluirPerfil,
  renomearPerfil,
  trocarBaseDoPerfil,
  type ResultadoPerfil,
} from '@/lib/perfis';
import type { Role } from '@prisma/client';

/** Gestão de Perfis de acesso (Configurações → Perfis). */

const STATUS: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, CONFLICT: 409, BLOCKED: 422 };
const PADRAO: Record<string, string> = {
  FORBIDDEN: 'Apenas o Administrador',
  INVALID: 'Dados inválidos',
  CONFLICT: 'Já existe',
  BLOCKED: 'Operação bloqueada',
};

function resposta(r: ResultadoPerfil) {
  if (r.ok) return NextResponse.json({ ok: true, id: r.id });
  return NextResponse.json({ error: r.message ?? PADRAO[r.reason], reason: r.reason }, { status: STATUS[r.reason] ?? 400 });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  switch (b.action) {
    case 'create':
      return resposta(await criarPerfil(user, { name: String(b.name ?? ''), baseRole: b.baseRole as Role }, ctx));
    case 'rename':
      return resposta(await renomearPerfil(user, { id: String(b.id ?? ''), name: String(b.name ?? '') }, ctx));
    case 'setBase':
      return resposta(await trocarBaseDoPerfil(user, { id: String(b.id ?? ''), baseRole: b.baseRole as Role }, ctx));
    case 'toggle':
      return resposta(await alternarPerfil(user, { id: String(b.id ?? ''), active: b.active === true }, ctx));
    case 'delete':
      return resposta(await excluirPerfil(user, String(b.id ?? ''), ctx));
    case 'setPermission':
      return resposta(
        await definirPermissaoDoPerfil(
          user,
          { profileId: String(b.profileId ?? ''), module: String(b.module ?? ''), canView: b.canView === true, canEdit: b.canEdit === true },
          ctx,
        ),
      );
    default:
      return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  }
}
