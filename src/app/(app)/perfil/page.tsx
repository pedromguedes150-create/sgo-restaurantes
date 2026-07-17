import { UserCircle2 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileClient } from '@/components/profile/profile-client';

export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const user = (await getSessionUser())!;
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, cpf: true, email: true } });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><UserCircle2 className="h-5 w-5 text-accent" /> Meu Perfil</h1>
        <p className="text-sm text-muted-foreground">Complete seus dados (nome completo e CPF) e troque sua senha. Supervisão/Admin visualizam esses dados.</p>
      </div>
      <Card><CardContent className="pt-4">
        <ProfileClient name={me?.name ?? ''} cpf={me?.cpf ?? ''} email={me?.email ?? ''} />
      </CardContent></Card>
    </div>
  );
}
