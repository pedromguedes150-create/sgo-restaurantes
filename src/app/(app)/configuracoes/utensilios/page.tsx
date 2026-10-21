import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { CatalogoUtensiliosClient } from '@/components/utensilios/catalogo-client';
import { listarCatalogo } from '@/lib/utensilios/catalogo';

export const dynamic = 'force-dynamic';

/** Configurações → Utensílios: a lista padrão do Inventário de Utensílios (Admin). */
export default async function ConfigUtensiliosPage() {
  const user = (await getSessionUser())!;
  const itens = await listarCatalogo();
  return (
    <div className="space-y-4">
      <Link href="/modulos/inventario-utensilios" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Inventário de Utensílios</Link>
      <LargeTitle title="Utensílios — lista padrão" subtitle="O que aparece em toda contagem, na ordem daqui. Cada unidade pode adicionar itens só no inventário dela." />
      <CatalogoUtensiliosClient itens={itens.map((i) => ({ id: i.id, name: i.name, order: i.order, active: i.active }))} podeEditar={['ADMIN', 'CEO'].includes(user.role)} />
    </div>
  );
}
