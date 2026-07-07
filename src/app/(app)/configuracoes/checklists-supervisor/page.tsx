import Link from 'next/link';
import { ArrowLeft, Eye } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listSupervisorChecklists } from '@/lib/supervisor/visits';
import { Card, CardContent } from '@/components/ui/card';
import { SupervisorChecklistsAdmin } from '@/components/admin/supervisor-checklists-admin';

export const dynamic = 'force-dynamic';

export default async function ChecklistsSupervisorPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') {
    return <p className="text-sm text-muted-foreground">Configurações são restritas ao Administrador.</p>;
  }
  const checklists = await listSupervisorChecklists();

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><Eye className="h-5 w-5 text-accent" /> Checklists de supervisor</h1>
        <p className="text-sm text-muted-foreground">Listas de verificação usadas pelo supervisor durante a visita às unidades (Rotina do Supervisor → Visitas).</p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <SupervisorChecklistsAdmin checklists={checklists.map((c) => ({ id: c.id, name: c.name, items: Array.isArray(c.items) ? (c.items as string[]) : [], active: c.active }))} />
        </CardContent>
      </Card>
    </div>
  );
}
