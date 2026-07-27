'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Bell, ArrowLeft, GraduationCap, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarState } from '@/components/layout/sidebar-state-provider';

export function AppHeader({ userName, roleLabel, unread = 0 }: { userName: string; roleLabel: string; unread?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname !== '/dashboard';
  const { collapsed, toggle } = useSidebarState();

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
    // A faixa bordô segue full-bleed; quem alinha é o container interno, que
    // usa o MESMO envelope do conteúdo — assim o header não fica recuado em
    // relação à sidebar no 2xl (era o degrau no canto superior esquerdo).
    // Altura: 64px no celular (alvo de toque) e 56px a partir de `lg`.
    <header className="sticky top-0 z-30 border-b bg-brand text-white print:hidden">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 lg:h-14 lg:max-w-none lg:pl-3 lg:pr-6 2xl:max-w-[1760px]">
        <div className="flex items-center gap-2">
          {/* Recolher/expandir mora aqui: fica fora da aside com overflow, não
              some no scroll e não se move quando a sidebar anima. */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="sidebar-nav"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 text-white hover:bg-white/10 lg:ml-0 lg:h-9 lg:w-9"
              aria-label="Voltar"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          {/* Avatar/nome levam ao Meu Perfil (dados + troca de senha) */}
          <Link href="/perfil" className="flex items-center gap-3 rounded-lg py-1 pr-2 hover:bg-white/10" aria-label="Meu Perfil">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-black text-white lg:h-9 lg:w-9">
              {initials}
            </div>
            {/* No desktop nome e cargo dividem a mesma linha — é o que devolve
                altura sem apertar o texto. No celular seguem empilhados. */}
            <div className="leading-tight lg:flex lg:items-baseline lg:gap-1.5">
              <p className="text-sm font-semibold">{userName}</p>
              <span aria-hidden className="hidden text-white/40 lg:inline">·</span>
              <p className="text-xs text-white/70">{roleLabel}</p>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/ajuda" aria-label="Treinamento da Plataforma" className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-white hover:bg-white/10 lg:h-9 lg:w-9">
            <GraduationCap className="h-5 w-5" />
          </Link>
          <Link href="/notificacoes" aria-label="Notificações" className="relative inline-flex h-12 w-12 items-center justify-center rounded-lg text-white hover:bg-white/10 lg:h-9 lg:w-9">
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
            className="text-white hover:bg-white/10 lg:h-9 lg:w-9"
            aria-label="Sair"
            onClick={logout}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
