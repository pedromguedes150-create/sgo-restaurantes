'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Bell, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AppHeader({ userName, roleLabel, unread = 0 }: { userName: string; roleLabel: string; unread?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname !== '/dashboard';

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const initials = userName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-brand px-4 text-white">
      <div className="flex items-center gap-2">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 text-white hover:bg-white/10"
            aria-label="Voltar"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-black text-white">
          {initials}
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">{userName}</p>
          <p className="text-xs text-white/70">{roleLabel}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Link href="/notificacoes" aria-label="Notificações" className="relative inline-flex h-12 w-12 items-center justify-center rounded-lg text-white hover:bg-white/10">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold leading-4 text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          aria-label="Sair"
          onClick={logout}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
