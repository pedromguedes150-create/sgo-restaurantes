import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveAttachment, UploadError } from '@/lib/uploads';
import { createProductStandard, toggleProductStandard, deleteProductStandard } from '@/lib/product-standards';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const ctx = requestContext(req);
  const contentType = req.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const category = String(form.get('category') ?? '');
      const name = String(form.get('name') ?? '');
      const description = (form.get('description') as string) || undefined;
      let photoPath: string | undefined;
      const file = form.get('photo');
      if (file instanceof File && file.size > 0) {
        const saved = await saveAttachment(file, 'standards', `std-${Date.now()}`);
        photoPath = saved.path;
      }
      const r = await createProductStandard(user, { category, name, description, photoPath }, ctx);
      if (!r.ok) return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Apenas o Administrador' : 'Dados inválidos' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
      return NextResponse.json({ ok: true, id: r.id });
    }
    const b = await req.json();
    const r = b.action === 'toggle' ? await toggleProductStandard(user, b.id, Boolean(b.active))
      : b.action === 'delete' ? await deleteProductStandard(user, b.id, ctx)
        : null;
    if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
    if (!r.ok) return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Apenas o Administrador' : 'Dados inválidos' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Falha' }, { status: 400 });
  }
}
