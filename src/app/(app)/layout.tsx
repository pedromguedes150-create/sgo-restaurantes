import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { roleLabel } from '@/lib/roles';
import { AppHeader } from '@/components/layout/app-header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Sidebar } from '@/components/layout/sidebar';
import { unreadCount } from '@/lib/notifications';
import { viewableNavHrefs } from '@/lib/permissions';
import { getInboxPendingCount } from '@/lib/communications/query';
import { CommunicationInterstitial } from '@/components/communications/communication-interstitial';
import { ServiceWorkerRegister } from '@/components/push/service-worker-register';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.needsTerms) redirect('/termo'); // LGPD: aceite no 1º login

  const isAdmin = user.role === 'ADMIN' || user.role === 'CEO';
  const [unread, viewable, commPending] = await Promise.all([unreadCount(user), viewableNavHrefs(user.role), getInboxPendingCount(user)]);
  const badges: Record<string, number> = {};
  if (commPending > 0) badges['/modulos/comunicacao'] = commPending;

  return (
    <div className="min-h-dvh bg-surface print:min-h-0 print:bg-white">
      <AppHeader userName={user.name} roleLabel={roleLabel(user.role)} unread={unread} />
      {/*
        Largura do conteúdo. Mobile-first: `max-w-3xl` (768px) coincide com o
        breakpoint `md`, então os overrides `md:` abaixo NÃO alteram o celular —
        lá o conteúdo já é mais estreito que o limite. No desktop o conteúdo usa
        o espaço restante do envelope (com teto em 1400px para não esticar as
        linhas de texto em monitores ultrawide).
      */}
      <div className="mx-auto flex w-full max-w-6xl xl:max-w-[1400px] print:block print:max-w-none">
        <Sidebar isAdmin={isAdmin} viewable={viewable} badges={badges} />
        <main className="w-full max-w-3xl flex-1 px-4 pb-24 pt-4 md:max-w-none md:px-6 md:pb-8 print:max-w-none print:p-0">{children}</main>
      </div>
      <BottomNav />
      <ServiceWorkerRegister />
      {commPending > 0 && <CommunicationInterstitial />}
    </div>
  );
}
