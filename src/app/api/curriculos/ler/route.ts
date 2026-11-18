import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { ARQUIVO_MAX_BYTES, MIME_DO_TIPO, tipoPeloConteudo } from '@/lib/curriculos/regras';
import { lerCurriculo } from '@/lib/ai/curriculo';

/**
 * Lê o currículo por IA para PRÉ-PREENCHER nome e telefone (v1.216.0).
 * Não grava nada: o arquivo só é guardado no encaminhamento. O tipo sai do
 * conteúdo (mesma regra do envio). Sem chave de IA responde `configured:false`
 * e a tela segue com os campos à mão.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: 'Anexe o currículo.' }, { status: 400 });
  if (arquivo.size > ARQUIVO_MAX_BYTES) return NextResponse.json({ error: 'Arquivo muito grande (máximo 15 MB).' }, { status: 422 });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoPeloConteudo(bytes);
  if (!tipo) return NextResponse.json({ error: 'Formato não aceito. Envie o currículo em PDF, JPG ou PNG.' }, { status: 422 });

  const r = await lerCurriculo({ base64: Buffer.from(bytes).toString('base64'), mediaType: MIME_DO_TIPO[tipo] });
  if (!r.configured) return NextResponse.json({ configured: false });
  if (!r.ok) return NextResponse.json({ configured: true, ok: false });
  return NextResponse.json({ configured: true, ok: true, nome: r.nome, telefone: r.telefone, legivel: r.legivel });
}
