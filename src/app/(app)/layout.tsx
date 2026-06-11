import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { roleLabel } from '@/lib/roles';
import { AppHeader } from '@/components/layout/app-header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Sidebar } from '@/components/layout/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.needsTerms) redirect('/termo'); // LGPD: aceite no 1º login

  const isAdmin = user.role === 'ADMIN' || user.role === 'CEO';

  return (
    <div className="min-h-dvh bg-surface">
      <AppHeader userName={user.name} roleLabel={roleLabel(user.role)} />
      <div className="mx-auto flex w-full max-w-6xl">
        <Sidebar isAdmin={isAdmin} />
        <main className="w-full max-w-3xl flex-1 px-4 pb-24 pt-4 md:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
