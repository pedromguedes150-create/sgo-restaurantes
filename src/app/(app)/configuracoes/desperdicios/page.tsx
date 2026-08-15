import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { WasteCategoriesAdmin } from '@/components/admin/waste-categories-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DesperdiciosConfigPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  const categories = await prisma.wasteCategory.findMany({ orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }], select: { id: true, name: true, active: true, measure: true } });

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Desperdícios — categorias</h1>
      <Card><CardContent className="pt-4"><WasteCategoriesAdmin categories={categories.map((c) => ({ ...c, measure: (c.measure === 'un' ? 'un' : 'kg') as 'kg' | 'un' }))} /></CardContent></Card>
    </div>
  );
}
