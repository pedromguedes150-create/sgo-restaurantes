'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, GraduationCap, Inbox, LogOut, Search, Settings, UserCircle } from 'lucide-react';
import { OPEN_COMMAND_EVENT } from '@/components/layout/command-palette';
import { MobileNav } from '@/components/layout/mobile-nav';
import { TopNav } from '@/components/layout/top-nav';
import { UnitSwitcher, type UnitOption } from '@/components/layout/unit-switcher';
import { ThemeNavToggle } from '@/components/theme/theme-nav-toggle';
import { NavBadge } from '@/components/sgo/nav-badge';
import type { AreaMontada } from '@/lib/nav/areas';

/**
 * BARRA GLOBAL FLUTUANTE do kit de layout (2-moldura/App-layout-raiz.trecho.tsx):
 * vidro fosco fixo no topo, recuada 16px das laterais, raio 14px, 68px de
 * altura (`.sgo-navbar`). Da esquerda para a direita: hambúrguer (abaixo de
 * lg), logo (beija-flor no squircle + "SGO"), divisor, módulos em tab bar,
 * espaço, e à direita busca, sino, tema, engrenagem e avatar.
 *
 * O que é do Restaurante e NÃO está no kit: o seletor de unidade (a operação
 * é por unidade; ele fica à esquerda da busca), a caixa de Comunicação e o
 * atalho de Ajuda — funções que já existiam no cabeçalho e não podem sumir.
 * A busca é o ⌘K que o Restaurante já tinha (o kit abre um campo; o palette
 * cobre o mesmo catálogo). Versão e data no tooltip do logo, como no kit.
 */
const ICONE_18 = { width: 18, height: 18 } as const;

export function SgoNavbar({
  userName, roleLabel, unread = 0, commPending = 0, units = [], selectedUnitId = null, areas = [], podeConfigurar = false, versao, atualizadoEm,
}: {
  userName: string; roleLabel: string; unread?: number; commPending?: number; units?: UnitOption[]; selectedUnitId?: string | null;
  areas?: AreaMontada[]; podeConfigurar?: boolean; versao: string; atualizadoEm: string;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const partes = userName.trim().split(/\s+/);
  const iniciais = partes.length >= 2 ? `${partes[0][0]}${partes[partes.length - 1][0]}` : userName.slice(0, 2);

  return (
    <header className="sgo-app sgo-navbar print:hidden" data-testid="sgo-navbar">
      <div className="flex w-full items-center gap-1">
        <MobileNav areas={areas} />

        <Link href="/dashboard" className="sgo-navlogo" title={`${versao} · Sistema de Gestão Operacional · Grupo Beija-Flor · atualizado em ${atualizadoEm}`} data-testid="link-home-logo">
          <span className="sgo-navlogo__mark"><img src="/sgo-bird-only.png" alt="" aria-hidden /></span>
          {/* A 375px, com o seletor de unidade (que o kit não tem), o avatar saía da
              barra: a palavra "SGO" some no celular e volta a partir de sm. */}
          <span className="sgo-navlogo__word hidden sm:inline">SGO</span>
        </Link>

        <div className="sgo-navdivider hidden lg:block" />

        <TopNav areas={areas} />

        <div className="flex-1" />

        <div className="flex items-center gap-1 sm:gap-1.5" style={{ color: 'var(--sgo-text-2)' }}>
          {units.length > 0 && (
            <div className="min-w-0"><UnitSwitcher units={units} selectedId={selectedUnitId} /></div>
          )}

          {/* A busca é o ⌘K que já existia: o mesmo catálogo, em tela cheia no celular. */}
          <button type="button" className="sgo-navsearch hidden sm:inline-flex" onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))} data-testid="button-global-search">
            <Search className="h-3.5 w-3.5" />
            <span>Buscar...</span>
            <kbd className="sgo-navsearch__kbd">Ctrl K</kbd>
          </button>

          <Link href="/modulos/comunicacao" className="sgo-naviconbtn" aria-label="Comunicação" title="Comunicação">
            <span className="sgo-navitem__ic"><Inbox style={ICONE_18} /><NavBadge count={commPending} cap={9} /></span>
          </Link>
          <Link href="/notificacoes" className="sgo-naviconbtn" aria-label="Notificações" title="Notificações">
            <span className="sgo-navitem__ic"><Bell style={ICONE_18} /><NavBadge count={unread} cap={9} /></span>
          </Link>
          <span className="hidden sm:inline-flex"><ThemeNavToggle /></span>
          {podeConfigurar && (
            <Link href="/configuracoes" className="sgo-naviconbtn hidden sm:inline-flex" aria-label="Configurações" title="Configurações">
              <Settings style={ICONE_18} />
            </Link>
          )}

          <div ref={menuRef} className="relative">
            <button type="button" className="sgo-navavatar" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} data-testid="button-user-menu">
              {iniciais.toUpperCase()}
            </button>
            {menu && (
              <div role="menu" className="sgo-panel sgo-panel--solid sgo-navpanel-enter absolute right-0 top-[calc(100%+10px)] w-52 overflow-hidden p-1.5" style={{ zIndex: 'var(--sgo-z-dropdown)' as unknown as number, boxShadow: 'var(--sgo-sh-pop)', color: 'var(--sgo-ink)' }}>
                <div className="px-2.5 py-2">
                  <p className="sgo-row__title truncate">{userName}</p>
                  <p className="text-[11px] font-medium" style={{ color: 'var(--sgo-accent)' }}>{roleLabel}</p>
                </div>
                <div className="my-1 border-t" style={{ borderColor: 'var(--sgo-hair)' }} />
                <Link href="/perfil" role="menuitem" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-[var(--sgo-r-sm)] px-2.5 py-1.5 text-[12.5px] hover:bg-[var(--sgo-panel-2)]"><UserCircle className="h-3.5 w-3.5" /> Meu Perfil</Link>
                <Link href="/ajuda" role="menuitem" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-[var(--sgo-r-sm)] px-2.5 py-1.5 text-[12.5px] hover:bg-[var(--sgo-panel-2)]"><GraduationCap className="h-3.5 w-3.5" /> Treinamento da Plataforma</Link>
                <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-[var(--sgo-r-sm)] px-2.5 py-1.5 text-left text-[12.5px] font-medium hover:bg-[var(--sgo-panel-2)]" data-testid="button-logout"><LogOut className="h-3.5 w-3.5" /> Sair</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
