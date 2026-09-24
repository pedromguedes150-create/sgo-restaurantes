import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { ensureDefaultSnackOptions, getSnackOptions } from '@/lib/waste/salgados';
import { Card, CardContent } from '@/components/ui/card';
import { WasteCategoriesAdmin } from '@/components/admin/waste-categories-admin';
import { SnackOptionsAdmin } from '@/components/admin/snack-options-admin';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function DesperdiciosConfigPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  /* Semeia o catálogo de salgados na primeira abertura — o Pedro cadastra os
     dele depois, editando/acrescentando aqui. */
  await ensureDefaultSnackOptions().catch(() => {});
  const [categories, opcoes] = await Promise.all([
    prisma.wasteCategory.findMany({ orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }], select: { id: true, name: true, active: true, measure: true } }),
    getSnackOptions({ includeInactive: true }),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Desperdícios" subtitle="Restaurante (kg) e Salgados (unidades) são frentes separadas." />

      <Card><CardContent className="pt-4">
        <p className="mb-2 sgo-type-15 font-semibold text-ink-900">Sobras Restaurante — categorias (kg)</p>
        <WasteCategoriesAdmin categories={categories.map((c) => ({ ...c, measure: (c.measure === 'un' ? 'un' : 'kg') as 'kg' | 'un' }))} />
      </CardContent></Card>

      <Card><CardContent className="pt-4">
        <p className="mb-1 sgo-type-15 font-semibold text-ink-900">Sobras Salgados — tipos e motivos (unidades)</p>
        <p className="mb-3 text-xs text-ink-500">O gerente escolhe destas listas ao lançar. Opção já usada não se exclui: desative, que o histórico continua legível.</p>
        <SnackOptionsAdmin tipos={opcoes.tipos} motivos={opcoes.motivos} />
      </CardContent></Card>
    </div>
  );
}
