import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listProductStandards } from '@/lib/product-standards';
import { Card, CardContent } from '@/components/ui/card';
import { ProductStandardsConfig } from '@/components/admin/product-standards-config';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function PadraoProdutosPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  const items = await listProductStandards();
  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Padrão de produtos" />
      <Card><CardContent className="pt-4">
        <ProductStandardsConfig items={items.map((p) => ({ id: p.id, category: p.category, name: p.name, description: p.description, photoPath: p.photoPath }))} />
      </CardContent></Card>
    </div>
  );
}
