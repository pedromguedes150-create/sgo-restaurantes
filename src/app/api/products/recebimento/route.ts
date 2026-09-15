import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { requestContext } from '@/lib/auth/service';
import { conferirRecebimento, type ConferenciaDeItem } from '@/lib/products/entrega';
import { saveAttachment, UploadError } from '@/lib/uploads';

/**
 * A conferência do recebimento na unidade.
 *
 * Chega como multipart porque cada divergência pode vir com uma **foto** — o
 * fardo estourado fotografado na doca vale mais do que qualquer descrição
 * escrita depois. Os apontamentos vêm num campo JSON; as fotos, uma por item,
 * em `foto-<itemId>`.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  let requestId = '';
  let itens: ConferenciaDeItem[] = [];
  let quality: string | null = null;
  let packaging: string | null = null;
  let note: string | null = null;

  try {
    const tipo = req.headers.get('content-type') ?? '';
    if (tipo.includes('multipart/form-data')) {
      const form = await req.formData();
      requestId = String(form.get('requestId') ?? '');
      quality = (form.get('quality') as string) || null;
      packaging = (form.get('packaging') as string) || null;
      note = (form.get('note') as string) || null;

      const crus = JSON.parse((form.get('itens') as string) || '[]') as ConferenciaDeItem[];
      itens = [];
      for (const i of Array.isArray(crus) ? crus : []) {
        const itemId = String(i.itemId ?? '');
        if (!itemId) continue;
        const arquivo = form.get(`foto-${itemId}`);
        /* O caminho salvo é do servidor; o que o cliente mandar em `photo` é
           ignorado — senão daria para apontar um arquivo de outra unidade. */
        const photo = arquivo instanceof File && arquivo.size > 0
          ? (await saveAttachment(arquivo, 'pedidos', `receb-${itemId}`)).path
          : null;
        itens.push({ itemId, issue: i.issue ?? null, note: i.note ?? null, photo });
      }
    } else {
      const b = await req.json().catch(() => ({}));
      requestId = String(b.requestId ?? '');
      quality = b.quality ?? null;
      packaging = b.packaging ?? null;
      note = b.note ?? null;
      itens = (Array.isArray(b.itens) ? b.itens : []).map((i: ConferenciaDeItem) => ({
        itemId: String(i.itemId ?? ''), issue: i.issue ?? null, note: i.note ?? null, photo: null,
      }));
    }
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  if (!requestId) return NextResponse.json({ error: 'Pedido não informado' }, { status: 400 });

  const r = await conferirRecebimento(user, requestId, { itens, quality, packaging, note }, requestContext(req));
  if (r.ok) return NextResponse.json({ ok: true, status: r.status });

  const status: Record<string, number> = { FORBIDDEN: 403, NAO_ENCONTRADO: 404, FORA_DE_ORDEM: 409, INVALID: 400 };
  return NextResponse.json({ error: r.detalhe ?? 'Não foi possível registrar a conferência', reason: r.reason }, { status: status[r.reason] ?? 400 });
}
