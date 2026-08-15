import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { canManageSuppliers, listSuppliers } from '@/lib/suppliers';
import { Card, CardContent } from '@/components/ui/card';
import { SuppliersAdmin } from '@/components/admin/suppliers-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FornecedoresConfigPage() {
  const user = (await getSessionUser())!;
  if (!canManageSuppliers(user)) return <p className="text-sm text-ink-500">Restrito a Admin, CEO e Supervisão.</p>;
  const suppliers = await listSuppliers();

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Fornecedores</h1>
      <Card><CardContent className="pt-4">
        <SuppliersAdmin suppliers={suppliers} />
      </CardContent></Card>
    </div>
  );
}
