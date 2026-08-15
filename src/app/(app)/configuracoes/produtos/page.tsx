import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listAllProducts } from '@/lib/products';
import { Card, CardContent } from '@/components/ui/card';
import { ProductCatalogAdmin } from '@/components/products/product-catalog-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ProdutosConfigPage() {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  const products = await listAllProducts();
  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <div>
        <h1 className="text-xl font-bold text-sgo-brand">Catálogo de Produtos</h1>
        <p className="text-sm text-ink-500">Produtos da <b>Fábrica</b> e do <b>CD</b> que os gerentes podem pedir. Importe sua lista por Excel.</p>
      </div>
      <Card><CardContent className="pt-4">
        <ProductCatalogAdmin products={products.map((p) => ({ id: p.id, name: p.name, origin: p.origin, category: p.category, measure: p.measure, active: p.active }))} />
      </CardContent></Card>
    </div>
  );
}
