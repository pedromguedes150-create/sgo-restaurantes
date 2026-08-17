import { BellRing, Palette } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileClient } from '@/components/profile/profile-client';
import { PushClient } from '@/components/push/push-client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const user = (await getSessionUser())!;
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, cpf: true, email: true } });

  return (
    <div className="space-y-4">
      <div>
        <LargeTitle title="Meu Perfil" subtitle="Complete seus dados (nome completo e CPF) e troque sua senha. Supervisão/Admin visualizam esses dados." />
      </div>
      <Card><CardContent className="pt-4">
        <ProfileClient name={me?.name ?? ''} cpf={me?.cpf ?? ''} email={me?.email ?? ''} />
      </CardContent></Card>

      {/* Aparência. O seletor de tema existia desde a Onda 0 mas só estava
          montado em /dev/ui — na prática ninguém conseguia sair do escuro,
          porque sem cookie o padrão é seguir o aparelho (src/lib/theme.ts) e
          quem tem o celular no escuro via o sistema escuro sem saída. */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900"><Palette className="h-5 w-5 text-ink-900" /> Aparência</h2>
        <p className="text-sm text-ink-500">Escolha claro, escuro, ou deixe seguir o que o celular estiver usando. Fica salvo neste aparelho.</p>
      </div>
      <Card><CardContent className="pt-4">
        <ThemeToggle />
      </CardContent></Card>

      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900"><BellRing className="h-5 w-5 text-ink-900" /> Notificações no celular</h2>
        <p className="text-sm text-ink-500">Receba os avisos do SGO mesmo com o app fechado. É preciso ativar em cada aparelho que você usa.</p>
      </div>
      <Card><CardContent className="pt-4">
        <PushClient />
      </CardContent></Card>
    </div>
  );
}
