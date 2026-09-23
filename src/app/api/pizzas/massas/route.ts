import { NextResponse } from 'next/server';
import { requestContext } from '@/lib/auth/service';
import { reasonResponse } from '@/lib/api/reason';
import { removeUpload, saveEvidence, UploadError } from '@/lib/uploads';
import {
  corrigirDesperdicio, corrigirRecebimento, estadoDoDia, excluirDesperdicio, excluirRecebimento,
  portaDoLink, registrarContagem, registrarDesperdicio, registrarRecebimento,
} from '@/lib/pizzas/massas';
import { FORMATO_DATA } from '@/lib/pizzas/massas-tipos';
import { RECUSAS_MASSAS, acaoDeMassas } from '@/lib/pizzas/massas-rota';

/**
 * PÚBLICA — Controle de Massas pelo link interno da pizzaria, sem login.
 *
 * O token da URL é a credencial e define a unidade; nada no corpo escolhe
 * pizzaria. Por isso mora em FORA_DA_MATRIZ, como `/api/pizzas`. O que esta
 * porta NÃO faz: mexer em dia anterior — a regra vive em `podeMexerNoDia`
 * (src/lib/pizzas/massas.ts) e devolve DIA_FECHADO.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const porta = await portaDoLink(url.searchParams.get('token') ?? '');
  if (!porta) return reasonResponse(RECUSAS_MASSAS, 'TOKEN');
  const data = url.searchParams.get('data') ?? porta.hoje;
  if (!FORMATO_DATA.test(data)) return reasonResponse(RECUSAS_MASSAS, 'DATA');
  return NextResponse.json(await estadoDoDia(porta.unit, data));
}

export async function POST(req: Request) {
  const ctx = requestContext(req);
  const tipo = req.headers.get('content-type') ?? '';

  /* Desperdício com foto chega como multipart: o JSON vai no campo `payload`
     e a imagem em `foto`. Todo o resto é JSON puro. */
  let body: Record<string, unknown> | null = null;
  let foto: File | null = null;
  if (tipo.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
    try { body = JSON.parse(String(form.get('payload') ?? '{}')); } catch { body = null; }
    const f = form.get('foto');
    if (f instanceof File && f.size > 0) foto = f;
  } else {
    body = await req.json().catch(() => null);
  }
  if (!body || typeof body.token !== 'string') return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const porta = await portaDoLink(body.token);
  if (!porta) return reasonResponse(RECUSAS_MASSAS, 'TOKEN');

  const acao = acaoDeMassas(body.acao);
  if (!acao) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  /* O link só grava HOJE. `data` vinda do corpo é aceita apenas se for hoje;
     a regra é reaplicada na função de domínio, mas recusar aqui evita gravar a
     foto para depois jogá-la fora. */
  const data = typeof body.data === 'string' ? body.data : porta.hoje;

  if (acao === 'desperdicio') {
    let photoPath: string | null = null;
    if (foto) {
      if (data !== porta.hoje) return reasonResponse(RECUSAS_MASSAS, 'DIA_FECHADO');
      try {
        photoPath = await saveEvidence(foto, porta.unit.id, `massa-desperdicio-${Date.now()}`);
      } catch (e) {
        if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
        throw e;
      }
    }
    const r = await registrarDesperdicio(porta, {
      data, quantidade: body.quantidade as number, motivo: body.motivoDesperdicio as never,
      observacao: body.observacao as string | null, loteId: (body.loteId as string | null) ?? null, photoPath,
    }, ctx);
    if (!r.ok) { if (photoPath) await removeUpload(photoPath).catch(() => {}); return reasonResponse(RECUSAS_MASSAS, r.reason); }
    return NextResponse.json({ ok: true, id: r.id });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const r =
    acao === 'recebimento' ? await registrarRecebimento(porta, { data, quantidade: body.quantidade as number, validade: String(body.validade ?? ''), lotCode: body.lotCode as string | null }, ctx)
    : acao === 'corrigirRecebimento' ? await corrigirRecebimento(porta, id, { quantidade: body.quantidade as number, validade: String(body.validade ?? ''), lotCode: body.lotCode as string | null }, ctx)
    : acao === 'excluirRecebimento' ? await excluirRecebimento(porta, id, null, ctx)
    : acao === 'corrigirDesperdicio' ? await corrigirDesperdicio(porta, id, { quantidade: body.quantidade as number, motivo: body.motivoDesperdicio as never, observacao: body.observacao as string | null, loteId: (body.loteId as string | null) ?? null }, ctx)
    : acao === 'excluirDesperdicio' ? await excluirDesperdicio(porta, id, null, ctx)
    : await registrarContagem(porta, { data, fisico: body.fisico as number, justificativa: body.justificativa as string | null }, ctx);

  if (!r.ok) return reasonResponse(RECUSAS_MASSAS, r.reason);
  return NextResponse.json(r);
}
