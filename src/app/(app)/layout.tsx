import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { SIDEBAR_COOKIE, isSidebarCollapsed } from '@/lib/sidebar-state';
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
  // Lido no servidor para a sidebar já sair na largura certa (sem piscar na
  // hidratação). O layout já é dinâmico por causa da sessão, então não custa
  // nada em cache.
  const sidebarCollapsed = isSidebarCollapsed(cookies().get(SIDEBAR_COOKIE)?.value);
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
        o espaço restante do envelope.

        Tetos de largura (o desconto fixo é 241px de sidebar + 48px de px-6):
        - até `lg`: `max-w-6xl` (1152px)
        - de `lg` a `2xl`: sem teto — o envelope acompanha a viewport, porque
          entre 1024 e 1535px o limite antigo só desperdiçava espaço
        - `2xl` (≥1536px): teto de 1760px, deixando ~80px de respiro por lado
          em 1920px sem esticar demais as linhas de texto
      */}
      <div className="mx-auto flex w-full max-w-6xl lg:max-w-none 2xl:max-w-[1760px] print:block print:max-w-none">
        <Sidebar isAdmin={isAdmin} viewable={viewable} badges={badges} defaultCollapsed={sidebarCollapsed} />
        <main className="w-full max-w-3xl flex-1 px-4 pb-24 pt-4 md:max-w-none md:px-6 md:pb-8 print:max-w-none print:p-0">{children}</main>
      </div>
      <BottomNav />
      <ServiceWorkerRegister />
      {commPending > 0 && <CommunicationInterstitial />}
    </div>
  );
}
