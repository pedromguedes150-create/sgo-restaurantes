import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { rh, rhConfigured, RhApiError } from '@/lib/rh/client';

/**
 * Diagnóstico da integração com o RH (Admin). Serve para validar a chave e
 * inspecionar o FORMATO real das respostas antes de mapear os campos no SGO.
 *
 * Uso: /api/rh/test?endpoint=colaboradores|unidades|escala|colaborador|folha&arg=<unidade|id>
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
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return NextResponse.json({ error: 'Apenas Admin/CEO' }, { status: 403 });
  if (!rhConfigured()) return NextResponse.json({ error: 'RH_API_KEY não configurada no .env' }, { status: 400 });

  const url = new URL(req.url);
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
