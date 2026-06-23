import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { PaymentsAdmin } from '@/components/admin/payments-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

function d(date: Date) { return new Date(date).toLocaleDateString('pt-BR'); }

export default async function PagamentosAdminPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;

  const [units, users, freelancers, miscTypes, delegations] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true } }),
    prisma.freelancer.findMany({ orderBy: { name: 'asc' }, include: { units: { include: { unit: { select: { id: true, name: true } } } } } }),
    prisma.miscPaymentType.findMany({ orderBy: { order: 'asc' } }),
    prisma.approvalDelegation.findMany({ orderBy: { startsAt: 'desc' }, include: { fromUser: { select: { name: true } }, toUser: { select: { name: true } } } }),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Cadastros de Pagamentos</h1>
      <Card><CardContent className="pt-4">
        <PaymentsAdmin
          units={units}
          users={users}
          freelancers={freelancers.map((f) => ({ id: f.id, name: f.name, defaultValue: Number(f.defaultValue), pixKey: f.pixKey, active: f.active, units: f.units.map((u) => u.unit.name), unitIds: f.units.map((u) => u.unit.id) }))}
          miscTypes={miscTypes.map((m) => ({ id: m.id, name: m.name, approverRole: m.approverRole, active: m.active }))}
          delegations={delegations.map((x) => ({ id: x.id, from: x.fromUser.name, to: x.toUser.name, period: `${d(x.startsAt)} a ${d(x.endsAt)}` }))}
        />
      </CardContent></Card>
    </div>
  );
}
