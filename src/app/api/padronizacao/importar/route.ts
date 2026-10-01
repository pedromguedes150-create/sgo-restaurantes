import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { saveAttachment, UploadError } from '@/lib/uploads';
import { podeGerirFichas } from '@/lib/preparo/query';
import { lerFichaDePreparo, MIDIAS_ACEITAS } from '@/lib/ai/preparo';

/**
 * IMPORTAR FICHA — passo 1 de 2. Recebe o arquivo, guarda-o como fonte e
 * pede à IA um RASCUNHO. NÃO grava ficha nenhuma: o Admin revisa na
 * pré-visualização e só então chama o POST de criação (passo 2).
 *
 * Se a IA falhar ou não estiver configurada, o arquivo já está salvo e a
 * resposta diz isso — o Admin segue pelo editor em branco, sem perder o
 * arquivo e sem ficha incompleta nascendo em silêncio.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (!podeGerirFichas(user)) return NextResponse.json({ error: 'Apenas o Administrador importa fichas.' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Envie o arquivo da ficha (foto ou PDF).' }, { status: 400 });

  let saved: { path: string; mimeType: string };
  try {
    saved = await saveAttachment(file, 'preparo', `fonte-${Date.now()}`);
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  const mediaType = saved.mimeType === 'image/jpg' ? 'image/jpeg' : saved.mimeType;
  if (!MIDIAS_ACEITAS.includes(mediaType)) {
    return NextResponse.json({ ok: true, sourceFilePath: saved.path, mimeType: saved.mimeType, ai: { configured: true, ok: false, error: 'Formato sem leitura automática (use foto JPG/PNG/WEBP ou PDF). Preencha a ficha manualmente.' } });
  }

  const buf = await readFile(path.join(process.cwd(), ...saved.path.split('/')));
  const ai = await lerFichaDePreparo({ base64: buf.toString('base64'), mediaType });
  return NextResponse.json({ ok: true, sourceFilePath: saved.path, mimeType: saved.mimeType, ai });
}
