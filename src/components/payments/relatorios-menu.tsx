'use client';

import * as React from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Os relatórios e consolidações de Pagamentos, num menu só.
 *
 * Eram três botões soltos no cabeçalho — "Recorrência de Freelancers",
 * "Pagamentos de Freelancers", "Pagamento Extra" — nomes que só quem já sabe
 * o que cada tela faz consegue distinguir. Um menu com uma linha de explicação
 * por item tira o excesso do cabeçalho e diz, ali mesmo, para que serve cada
 * um. As telas continuam as mesmas; só o caminho até elas mudou.
 *
 * A11y no mesmo padrão do `ActionMenu`: `aria-haspopup="menu"`, ↑/↓ andam,
 * Esc fecha e devolve o foco, fecha ao clicar fora e ao rolar.
 */
export interface RelatorioDePagamentos {
  href: string;
  titulo: string;
  descricao: string;
}

/* "Relatórios de Pagamentos", e não só "Relatórios": a barra de navegação já
   tem uma área com esse nome na mesma tela, e dois botões iguais confundem. */
export function RelatoriosMenu({ itens, rotulo = 'Relatórios de Pagamentos' }: { itens: RelatorioDePagamentos[]; rotulo?: string }) {
  const [open, setOpen] = React.useState(false);
  const botao = React.useRef<HTMLButtonElement>(null);
  const caixa = React.useRef<HTMLDivElement>(null);
  const linksRef = React.useRef<(HTMLAnchorElement | null)[]>([]);

  const fechar = React.useCallback((devolverFoco = true) => {
    setOpen(false);
    if (devolverFoco) botao.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const foraDaCaixa = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!caixa.current?.contains(alvo) && !botao.current?.contains(alvo)) setOpen(false);
    };
    const aoRolar = () => setOpen(false);
    document.addEventListener('mousedown', foraDaCaixa);
    window.addEventListener('scroll', aoRolar, true);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      window.removeEventListener('scroll', aoRolar, true);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) linksRef.current[0]?.focus();
  }, [open]);

  function teclado(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
    const passo = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const atual = linksRef.current.findIndex((el) => el === document.activeElement);
    const proximo = (atual + passo + itens.length) % itens.length;
    linksRef.current[proximo]?.focus();
  }

  if (itens.length === 0) return null;

  return (
    <div className="relative shrink-0">
      <button
        ref={botao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink-900',
          'transition-colors duration-sgo-1 ease-sgo-std hover:border-brand focus-visible:outline-none focus-visible:shadow-sgo-focus',
          open && 'border-brand',
        )}
      >
        <FileText className="h-4 w-4" /> {rotulo}
        <ChevronDown className={cn('h-4 w-4 text-ink-500 transition-transform duration-sgo-1', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={caixa}
          role="menu"
          aria-label={rotulo}
          onKeyDown={teclado}
          className={cn(
            'absolute right-0 top-[calc(100%+4px)] z-30 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden',
            'rounded-card border border-line bg-raised p-1 shadow-sgo-raised',
            'animate-[sgo-menu-in_140ms_var(--sgo-ease-nav)] motion-reduce:animate-none',
          )}
        >
          {itens.map((item, i) => (
            <a
              key={item.href}
              ref={(el) => { linksRef.current[i] = el; }}
              role="menuitem"
              href={item.href}
              onClick={() => fechar(false)}
              className="sgo-no-press block rounded-[10px] px-3 py-2.5 text-left transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none"
            >
              <span className="block text-sm font-semibold text-ink-900">{item.titulo}</span>
              {/* A linha de apoio é o que faltava: o nome sozinho não diz o que a tela responde. */}
              <span className="block sgo-type-13 font-normal text-ink-500">{item.descricao}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
