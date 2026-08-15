import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionsAdmin } from '@/components/admin/permissions-admin';
import { MODULES, permissionMatrix } from '@/lib/permissions';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PerfisAdminPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  const matrix = await permissionMatrix();

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Perfis de acesso</h1>
      <p className="text-sm text-ink-500">Defina o que cada perfil pode ver e editar em cada módulo.</p>
      <Card><CardContent className="pt-4">
        <PermissionsAdmin modules={MODULES.map((m) => ({ key: m.key, label: m.label }))} matrix={matrix} />
      </CardContent></Card>
    </div>
  );
}
