import { NextResponse } from 'next/server';
import { requestContext } from '@/lib/auth/service';
import { currentOperationalDate } from '@/lib/date/operational';
import { unidadePorToken } from '@/lib/pizzas/acesso';
import { fechamentoDoDia, salvarFechamento, type MotivoRecusa } from '@/lib/pizzas/fechamento';
import { FORMATO_DATA, MSG_DUPLICADO } from '@/lib/pizzas/tipos';

/**
 * PÚBLICA — fechamento de pizzas preenchido pelo link interno, sem login.
 *
 * A credencial é o token na URL, e é ele que define a unidade: nada no corpo
 * escolhe pizzaria. Por isso a rota fica em FORA_DA_MATRIZ — exigir perfil aqui
 * quebraria o preenchimento inteiro, que é justamente de quem não tem conta.
 */

const RECUSAS: Record<MotivoRecusa, { msg: string; status: number }> = {
  TOKEN: { msg: 'Link inválido ou desativado', status: 404 },
  DATA: { msg: 'Data fora do período permitido', status: 400 },
  ITENS: { msg: 'Informe ao menos um tamanho, sabor e quantidade válidos', status: 400 },
  DUPLICADO: { msg: MSG_DUPLICADO, status: 409 },
};

/** Consulta o fechamento de uma data — é o que alimenta o aviso de duplicidade. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const unit = await unidadePorToken(token);
  if (!unit) return NextResponse.json({ error: RECUSAS.TOKEN.msg }, { status: 404 });

  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const data = url.searchParams.get('data') ?? hoje;
  if (!FORMATO_DATA.test(data)) return NextResponse.json({ error: RECUSAS.DATA.msg }, { status: 400 });

  const closing = await fechamentoDoDia(unit.id, data);
  return NextResponse.json({ hoje, operationalDate: data, closing });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.token) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const r = await salvarFechamento(
    {
      token: String(body.token),
      operationalDate: body.operationalDate ? String(body.operationalDate) : undefined,
      items: Array.isArray(body.items) ? body.items : [],
      observation: body.observation ?? null,
      substituir: body.substituir === true,
    },
    requestContext(req),
  );

  if (!r.ok) {
    const { msg, status } = RECUSAS[r.reason];
    return NextResponse.json({ error: msg, reason: r.reason }, { status });
  }
  return NextResponse.json({ ok: true, total: r.total, substituiu: r.substituiu, operationalDate: r.operationalDate });
}
