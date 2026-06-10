import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { roleLabel } from '@/lib/roles';
import { AppHeader } from '@/components/layout/app-header';
import { BottomNav } from '@/components/layout/bottom-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-dvh bg-surface">
      <AppHeader userName={user.name} roleLabel={roleLabel(user.role)} />
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 md:pb-8">{children}</main>
      <BottomNav />
    </div>
  );
}
