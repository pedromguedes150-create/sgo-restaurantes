import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { roleLabel } from '@/lib/roles';
import { RETENTION_MONTHS_DEFAULT, TERMS_VERSION } from '@/lib/lgpd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollText, Building2, Users, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const user = (await getSessionUser())!;
  const isAdmin = user.role === 'ADMIN' || user.role === 'CEO';

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-brand">Configurações</h1>
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Configurações são restritas ao Administrador.</CardContent></Card>
      </div>
    );
  }

  const [units, users] = await Promise.all([
    prisma.unit.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, role: true, active: true } }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand">Configurações</h1>

      <Link href="/auditoria" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand">
        <ScrollText className="h-5 w-5 text-accent" /> Log de Auditoria
      </Link>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-accent" /> Unidades ({units.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {units.map((u) => (
            <div key={u.id} className="flex justify-between">
              <span>{u.name} <span className="text-xs text-muted-foreground">({u.code})</span></span>
              <span className="text-xs text-muted-foreground">corte {String(u.cutoffHour).padStart(2, '0')}:00 · {u.timezone}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-accent" /> Usuários ({users.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {users.map((u) => (
            <div key={u.id} className="flex justify-between">
              <span>{u.name}{!u.active && <span className="ml-1 text-xs text-critical">(inativo)</span>}</span>
              <span className="text-xs text-muted-foreground">{roleLabel(u.role)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /> LGPD</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Versão do termo</span><span className="font-medium">v{TERMS_VERSION}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Retenção de dados sensíveis</span><span className="font-medium">{RETENTION_MONTHS_DEFAULT} meses</span></div>
          <p className="text-xs text-muted-foreground">Anexos sensíveis restritos a Supervisor/Admin/CEO; acessos auditados. Exportação/exclusão de dados do titular disponível via API LGPD (Admin).</p>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Edição completa de cadastros (criar/editar unidades, usuários, checklists, categorias) entra na evolução das Configurações.
      </p>
    </div>
  );
}
