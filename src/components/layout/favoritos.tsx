'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * FAVORITOS — os atalhos que cada pessoa escolhe.
 *
 * Moram no navegador, não no banco. É uma preferência de conveniência, por
 * aparelho, e uma tabela para isto significaria migração, API, permissão e
 * escopo por unidade para resolver "qual botão aparece primeiro". Se o
 * armazenamento falhar (janela anônima, dados bloqueados), a tela continua
 * inteira e os atalhos simplesmente voltam ao padrão — por isso TODA leitura e
 * escrita está dentro de try/catch.
 *
 * Guardamos o ENDEREÇO, não a chave do módulo: é o endereço que a tela usa para
 * navegar e o que a permissão confere. Favorito de tela que a pessoa deixou de
 * poder abrir é filtrado na hora de desenhar, não apagado — devolver a
 * permissão traz o atalho de volta sem ela ter de favoritar outra vez.
 */

const CHAVE = 'sgo:favoritos';
const EVENTO = 'sgo:favoritos-mudou';
const LIMITE = 12;

function ler(): string[] {
  try {
    const cru = window.localStorage.getItem(CHAVE);
    if (!cru) return [];
    const v: unknown = JSON.parse(cru);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, LIMITE) : [];
  } catch {
    return [];
  }
}

function gravar(hrefs: string[]) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(hrefs.slice(0, LIMITE)));
  } catch {
    /* Sem armazenamento a escolha não persiste; a tela segue funcionando. */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** A lista de favoritos, viva: muda em toda estrela clicada, em qualquer canto. */
export function useFavoritos(): { favoritos: string[]; alternar: (href: string) => void; ehFavorito: (href: string) => boolean } {
  /* Começa vazio nos dois lados e só lê o armazenamento depois de montar: ler
     no primeiro render daria HTML diferente no servidor e no cliente. */
  const [favoritos, setFavoritos] = useState<string[]>([]);

  useEffect(() => {
    const sincronizar = () => setFavoritos(ler());
    sincronizar();
    window.addEventListener(EVENTO, sincronizar);
    window.addEventListener('storage', sincronizar);
    return () => { window.removeEventListener(EVENTO, sincronizar); window.removeEventListener('storage', sincronizar); };
  }, []);

  const alternar = useCallback((href: string) => {
    const atuais = ler();
    gravar(atuais.includes(href) ? atuais.filter((h) => h !== href) : [...atuais, href]);
  }, []);

  const ehFavorito = useCallback((href: string) => favoritos.includes(href), [favoritos]);
  return { favoritos, alternar, ehFavorito };
}

/** Estrela de favoritar — usada no mega menu e no hub de módulos. */
export function FavoriteStar({ href, label, className }: { href: string; label: string; className?: string }) {
  const { ehFavorito, alternar } = useFavoritos();
  const marcado = ehFavorito(href);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); alternar(href); }}
      aria-pressed={marcado}
      aria-label={marcado ? `Remover ${label} dos favoritos` : `Adicionar ${label} aos favoritos`}
      title={marcado ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-control outline-none hover:bg-sunken focus-visible:shadow-sgo-focus',
        className,
        /* Depois de `className`, e não antes: quem já é favorito fica sempre
           visível, mesmo quando o chamador esconde a estrela fora do hover. */
        marcado && 'opacity-100',
      )}
    >
      <Star className={cn('h-4 w-4', marcado ? 'fill-brand text-brand' : 'text-ink-400')} />
    </button>
  );
}
