'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavBadge } from './nav-badge';

/**
 * Cabeçalho de página do kit de layout (3-componentes-sgo/SgoPageHeader.tsx).
 *
 * Uma linha só, nesta ordem: [título + subtítulo] — [sub-abas] — [ações].
 * Só apresentação: a aba ativa é derivada da ROTA (ou de `active`, para abas
 * de estado local). Adaptação ao Next: `usePathname` no lugar do `useLocation`
 * do wouter; a estrutura e as classes são as do kit (sgo-kit.css, seção 22).
 */
export interface SgoPageTab {
  label: string;
  icon?: ReactNode;
  /** Destino da aba. Quando presente, a aba é um link e o ativo sai da rota. */
  href?: string;
  /** Alternativa ao href para abas que trocam estado local. */
  onClick?: () => void;
  /** Marca a aba como ativa quando ela não é baseada em rota. */
  active?: boolean;
  badge?: number;
  testId?: string;
  /** Casa também as sub-rotas (ex.: /colaboradores/12). Padrão: só o exato. */
  matchPrefix?: boolean;
}

export interface SgoPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  tabs?: SgoPageTab[];
  actions?: ReactNode;
  testId?: string;
}

export function SgoPageHeader({ title, subtitle, tabs, actions, testId }: SgoPageHeaderProps) {
  const pathname = usePathname() ?? '';

  const estaAtiva = (t: SgoPageTab) => {
    if (t.active !== undefined) return t.active;
    if (!t.href) return false;
    const alvo = t.href.split('?')[0];
    return t.matchPrefix ? pathname === alvo || pathname.startsWith(alvo + '/') : pathname === alvo;
  };

  const trilhoRef = useRef<HTMLElement | null>(null);
  const [fade, setFade] = useState<'none' | 'left' | 'right' | 'both'>('none');

  // Qual borda do trilho está escondendo aba: precisa ser medido — o CSS não
  // sabe se há transbordo, e mascarar os dois lados sempre apagava a primeira
  // e a última aba.
  useEffect(() => {
    const el = trilhoRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => {
      const maximo = el.scrollWidth - el.clientWidth;
      if (maximo <= 1) return setFade('none');
      const temEsquerda = el.scrollLeft > 1;
      const temDireita = el.scrollLeft < maximo - 1;
      setFade(temEsquerda && temDireita ? 'both' : temEsquerda ? 'left' : 'right');
    };
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', medir); ro.disconnect(); };
  }, [tabs]);

  const rotuloAtivo = tabs?.find(estaAtiva)?.label;
  useEffect(() => {
    const alvo = trilhoRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    alvo?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [rotuloAtivo]);

  return (
    <header className="sgo-phdr" data-testid={testId}>
      <div className="sgo-phdr__id">
        <h1 className="sgo-phdr__title">{title}</h1>
        {subtitle && <div className="sgo-phdr__sub">{subtitle}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <nav ref={trilhoRef} className="sgo-phdr__tabs" data-fade={fade} aria-label="Seções da página">
          {tabs.map((t) => {
            const on = estaAtiva(t);
            const conteudo = (
              <>
                {t.icon}
                <span>{t.label}</span>
                <NavBadge count={t.badge ?? 0} />
              </>
            );
            const classe = `sgo-phdr__tab${on ? ' on' : ''}`;
            return t.href ? (
              <Link key={t.label} href={t.href} className={classe} aria-current={on ? 'page' : undefined} data-testid={t.testId}>
                {conteudo}
              </Link>
            ) : (
              <button key={t.label} type="button" className={classe} onClick={t.onClick} aria-current={on ? 'page' : undefined} data-testid={t.testId}>
                {conteudo}
              </button>
            );
          })}
        </nav>
      )}

      {actions && <div className="sgo-phdr__actions">{actions}</div>}
    </header>
  );
}
