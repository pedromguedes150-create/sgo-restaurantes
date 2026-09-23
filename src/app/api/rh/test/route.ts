import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { rh, rhConfigured, rhGetV2, rhV2Configured, RhApiError } from '@/lib/rh/client';
import { pathDePingValido } from '@/lib/rh/v2-ping';

/**
 * Diagnóstico da integração com o RH (Admin). Serve para validar a chave e
 * inspecionar o FORMATO real das respostas antes de mapear os campos no SGO.
 *
 * Uso: /api/rh/test?endpoint=colaboradores|unidades|escala|colaborador|folha&arg=<unidade|id>
 *      /api/rh/test?v=2&path=/colaboradores   (API v2 — JSON cru, caminho relativo à base v2)
 *
 * SEGURANÇA: expõe dados crus do RH do grupo inteiro (PII/folha) — por isso é
 * EXCLUSIVO de desenvolvimento. Em produção retorna 404.
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Indisponível em produção' }, { status: 404 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return NextResponse.json({ error: 'Apenas Admin/CEO' }, { status: 403 });
  const url = new URL(req.url);

  /* v2: mesmo despejo cru, outra base. Só em desenvolvimento, como o resto. */
  if (url.searchParams.get('v') === '2') {
    if (!rhV2Configured()) return NextResponse.json({ error: 'RH_API_V2_KEY não configurada no .env' }, { status: 400 });
    const path = url.searchParams.get('path') ?? '/colaboradores';
    if (!pathDePingValido(path)) return NextResponse.json({ error: 'path inválido' }, { status: 400 });
    try {
      return NextResponse.json({ ok: true, v: 2, path, data: await rhGetV2(path, { fresh: true }) });
    } catch (e) {
      if (e instanceof RhApiError) return NextResponse.json({ ok: false, v: 2, status: e.status, error: e.message }, { status: 502 });
      return NextResponse.json({ ok: false, v: 2, error: String(e) }, { status: 500 });
    }
  }

  if (!rhConfigured()) return NextResponse.json({ error: 'RH_API_KEY não configurada no .env' }, { status: 400 });

  const endpoint = url.searchParams.get('endpoint') ?? 'colaboradores';
  const arg = url.searchParams.get('arg') ?? '';

  try {
    let data: unknown;
    switch (endpoint) {
      case 'colaboradores': data = await rh.colaboradores(); break;
      case 'unidades': data = await rh.unidades(); break;
      case 'escala': data = await rh.escala(arg); break;
      case 'colaborador': data = await rh.colaborador(arg); break;
      case 'folha': data = await rh.folha(); break;
      case 'beneficios': data = await rh.beneficios(); break;
      default: return NextResponse.json({ error: 'endpoint desconhecido' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, endpoint, data });
  } catch (e) {
    if (e instanceof RhApiError) return NextResponse.json({ ok: false, status: e.status, error: e.message }, { status: 502 });
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
