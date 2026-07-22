import { getSessionUser } from '@/lib/auth/session';
import { listAllProducts, exportProductsBuffer } from '@/lib/products';

export async function GET() {
  const user = await getSessionUser();
  if (!user || !['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return new Response('Sem permissão', { status: 403 });
  const products = await listAllProducts();
  const buf = exportProductsBuffer(products.map((p) => ({ name: p.name, origin: p.origin, category: p.category, measure: p.measure, active: p.active })));
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="catalogo-produtos.xlsx"',
    },
  });
}
