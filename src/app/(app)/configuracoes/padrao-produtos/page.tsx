import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listProductStandards } from '@/lib/product-standards';
import { Card, CardContent } from '@/components/ui/card';
import { ProductStandardsConfig } from '@/components/admin/product-standards-config';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PadraoProdutosPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  const items = await listProductStandards();
  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-sgo-brand">Padrão de produtos</h1>
      <Card><CardContent className="pt-4">
        <ProductStandardsConfig items={items.map((p) => ({ id: p.id, category: p.category, name: p.name, description: p.description, photoPath: p.photoPath }))} />
      </CardContent></Card>
    </div>
  );
}
