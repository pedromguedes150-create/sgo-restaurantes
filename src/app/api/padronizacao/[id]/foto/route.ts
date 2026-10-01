import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { saveAttachment, removeUpload, UploadError } from '@/lib/uploads';
import { setPrepStandardPhoto } from '@/lib/preparo/write';
import { respostaDaEscrita } from '../../resposta';

/**
 * ALTERAR FOTO — e só a foto. POST (multipart `photo`) substitui; DELETE
 * remove. Nenhum outro dado da ficha passa por aqui, por contrato.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  const foto = form?.get('photo');
  if (!(foto instanceof File) || foto.size === 0) return NextResponse.json({ error: 'Envie a nova foto.' }, { status: 400 });
  if (!foto.type.startsWith('image/') && foto.type !== '') return NextResponse.json({ error: 'A foto do produto precisa ser uma imagem.' }, { status: 422 });

  let imagePath: string;
  try {
    imagePath = (await saveAttachment(foto, 'preparo', `foto-${Date.now()}`)).path;
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
  const r = await setPrepStandardPhoto(user, params.id, imagePath, requestContext(req));
  if (!r.ok) await removeUpload(imagePath);
  return respostaDaEscrita(r);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  return respostaDaEscrita(await setPrepStandardPhoto(user, params.id, null, requestContext(req)));
}
