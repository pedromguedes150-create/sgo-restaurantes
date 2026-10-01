import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { saveAttachment, removeUpload, UploadError } from '@/lib/uploads';
import { createPrepStandard } from '@/lib/preparo/write';
import { respostaDaEscrita } from './resposta';

/**
 * Criar ficha de preparo (multipart): `dados` = JSON da ficha já revisada,
 * `photo` = foto do produto (opcional), `sourceFilePath` = arquivo-fonte da
 * importação (opcional), `codigoRepetido` = 'NOVA' quando o Admin escolheu
 * "Criar nova ficha" para um código que já existe.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const txt = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };

  let dados: unknown;
  try { dados = JSON.parse(txt('dados') || 'null'); } catch { return NextResponse.json({ error: 'Dados da ficha em formato inválido.' }, { status: 400 }); }

  let imagePath: string | null = null;
  const foto = form.get('photo');
  if (foto instanceof File && foto.size > 0) {
    if (!foto.type.startsWith('image/') && foto.type !== '') return NextResponse.json({ error: 'A foto do produto precisa ser uma imagem.' }, { status: 422 });
    try {
      imagePath = (await saveAttachment(foto, 'preparo', `foto-${Date.now()}`)).path;
    } catch (e) {
      if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
      throw e;
    }
  }

  const sourceFilePath = txt('sourceFilePath') || null;
  const r = await createPrepStandard(user, {
    dados, imagePath, sourceFilePath: sourceFilePath && sourceFilePath.startsWith('uploads/preparo/') ? sourceFilePath : null,
    codigoRepetido: txt('codigoRepetido') === 'NOVA' ? 'NOVA' : undefined,
  }, requestContext(req));

  if (!r.ok && imagePath) await removeUpload(imagePath);
  return respostaDaEscrita(r);
}
