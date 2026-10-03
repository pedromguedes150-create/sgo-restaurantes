'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

/**
 * Casca das páginas de módulo do kit (3-componentes-sgo/ModuleShell.tsx).
 *
 * Hierarquia, de cima para baixo: navbar global (fora daqui) → TRILHO de
 * seções (`.sgo-trilho`, por portal, logo abaixo da barra) → CABEÇALHO
 * (`.sgo-phdr`: título, subtítulo, ações) → FILTROS (`.sgo-filtros`) → conteúdo.
 *
 * Adaptações ao Restaurante: a permissão já foi resolvida no servidor (o
 * catálogo de menu só entrega o que o perfil pode abrir), então as seções
 * chegam prontas; o alvo do portal é `#subnav-portal-target`, que o layout
 * deixa no topo do <main>. O trilho é OPCIONAL e desligado por padrão, como no
 * kit — ligue onde as seções são subpáginas que não têm outra porta.
 */
export interface ModuleSection {
  label: string;
  url: string;
  icon?: LucideIcon;
  /** Casa também as sub-rotas. Padrão: casa prefixo (como no kit). */
  matchPrefix?: boolean;
}

export interface ModuleShellProps {
  secoes?: ModuleSection[];
  mostrarTrilho?: boolean;
  /** Atalhos do MÓDULO, à direita do trilho. */
  atalhos?: ReactNode;
  titulo?: string;
  subtitulo?: ReactNode;
  /** Ações da página: uma primária + secundárias como chips. */
  acoes?: ReactNode;
  filtros?: ReactNode;
  children?: ReactNode;
  testId?: string;
}

export const SUBNAV_PORTAL_ID = 'subnav-portal-target';

function usePortalAlvo(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.getElementById(SUBNAV_PORTAL_ID)); }, []);
  return el;
}

export function ModuleShell({ secoes, mostrarTrilho = false, atalhos, titulo, subtitulo, acoes, filtros, children, testId }: ModuleShellProps) {
  const pathname = usePathname() ?? '';
  const alvo = usePortalAlvo();
  const visiveis = secoes ?? [];

  const estaAtiva = (s: ModuleSection) => {
    const alvoRota = s.url.split('?')[0];
    return s.matchPrefix === false ? pathname === alvoRota : pathname === alvoRota || pathname.startsWith(alvoRota + '/');
  };

  // Trilho só existe com mais de uma seção visível: uma seção sozinha não é
  // navegação, é rótulo — e o título da página já diz onde o usuário está.
  const temTrilho = mostrarTrilho && (visiveis.length > 1 || !!atalhos);
  const trilho = temTrilho && alvo
    ? createPortal(
      <nav className="sgo-trilho" aria-label="Seções do módulo" data-testid="module-trilho">
        {visiveis.map((s) => {
          const on = estaAtiva(s);
          const Icone = s.icon;
          return (
            <Link key={s.url} href={s.url} className={`sgo-trilho__item${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
              {Icone && <Icone aria-hidden />}
              {s.label}
            </Link>
          );
        })}
        {atalhos && <div className="sgo-trilho__atalhos">{atalhos}</div>}
      </nav>,
      alvo,
    )
    : null;

  const temPagina = !!titulo || !!filtros || !!children;

  return (
    <>
      {trilho}
      {temPagina && (
        <div className="sgo-module" data-testid={testId}>
          {titulo && (
            <header className="sgo-phdr">
              <div className="sgo-phdr__id">
                <h1 className="sgo-phdr__title">{titulo}</h1>
                {subtitulo && <div className="sgo-phdr__sub">{subtitulo}</div>}
              </div>
              <div className="flex-1" />
              {acoes && <div className="sgo-phdr__actions">{acoes}</div>}
            </header>
          )}
          {filtros && <div className="sgo-filtros">{filtros}</div>}
          {children}
        </div>
      )}
    </>
  );
}
