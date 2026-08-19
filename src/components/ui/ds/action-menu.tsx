'use client';

import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Menu de ações de uma linha de lista ("···").
 *
 * Por que existe: as listas do SGO carregavam TODAS as ações de cada item como
 * botões visíveis. Na aba Análise de Notas Recebidas eram cinco por nota —
 * Ver/Editar, Editar data, Problema, Devolver, Excluir — e com 147 notas na
 * tela isso dava 735 controles disputando espaço com 147 informações, dois
 * deles vermelhos repetidos 294 vezes. Nenhuma lista faz isso: a linha mostra
 * conteúdo, e as ações ficam a um toque de distância.
 *
 * As ações não somem — mudam de lugar. É a diferença entre não existir e não
 * estar gritando.
 *
 * A11y: `aria-haspopup="menu"` + `role="menu"`, ↑/↓ andam, Enter/Espaço
 * escolhem, Esc fecha e devolve o foco ao botão (senão o teclado fica órfão no
 * meio da lista). Fecha ao clicar fora e ao rolar a página — um menu ancorado
 * que continua parado enquanto o conteúdo rola fica flutuando no vazio.
 */
export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  /** Vermelho e por último. Use só para o que destrói dado. */
  destructive?: boolean;
  disabled?: boolean;
}

export function ActionMenu({
  items,
  label = 'Ações',
  className,
}: {
  items: ActionMenuItem[];
  /** Vai para o aria-label do botão: "Ações da nota SOUZA CRUZ" é melhor que "Ações". */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [ativo, setAtivo] = React.useState(0);
  const botao = React.useRef<HTMLButtonElement>(null);
  const caixa = React.useRef<HTMLDivElement>(null);
  const itensRef = React.useRef<(HTMLButtonElement | null)[]>([]);

  const habilitados = items.filter((i) => !i.disabled);
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
    // `capture` porque o scroll costuma vir de um contêiner interno, e o
    // evento não borbulha até o document.
    window.addEventListener('scroll', aoRolar, true);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      window.removeEventListener('scroll', aoRolar, true);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) itensRef.current[0]?.focus();
  }, [open]);

  function teclado(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
    const passo = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const proximo = (ativo + passo + habilitados.length) % habilitados.length;
    setAtivo(proximo);
    itensRef.current[proximo]?.focus();
  }

  // Destrutivas por último, sempre — a ordem vira previsível entre as telas e
  // ninguém erra o alvo procurando "Excluir" no meio da lista.
  const ordenados = [...items].sort((a, b) => Number(a.destructive ?? false) - Number(b.destructive ?? false));

  return (
    <div className={cn('relative shrink-0', className)}>
      <button
        ref={botao}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'sgo-control-icon grid h-9 w-9 place-items-center rounded-pill text-ink-500',
          'transition-colors duration-sgo-2 ease-sgo-std hover:bg-sunken hover:text-ink-900',
          'focus-visible:outline-none focus-visible:shadow-sgo-focus',
          open && 'bg-sunken text-ink-900',
        )}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <div
          ref={caixa}
          role="menu"
          aria-label={label}
          onKeyDown={teclado}
          /* Ancorado à DIREITA do botão: a lista cresce para dentro da tela em
             vez de vazar pela borda, que é onde o "···" sempre fica. */
          className={cn(
            /* 15rem porque 13 fazia "Devolver ao fornecedor" quebrar em duas
               linhas; com o teto de 100vw o menu ainda cabe num celular de
               375px sem vazar pela borda. */
            'absolute right-0 top-[calc(100%+4px)] z-30 min-w-[15rem] max-w-[calc(100vw-2rem)] overflow-hidden',
            'rounded-card border border-line bg-raised p-1 shadow-sgo-raised',
            'animate-[sgo-menu-in_140ms_var(--sgo-ease-nav)] motion-reduce:animate-none',
          )}
        >
          {ordenados.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => { itensRef.current[i] = el; }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { fechar(false); item.onSelect(); }}
              className={cn(
                'sgo-no-press flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium',
                'transition-colors duration-sgo-1 ease-sgo-std focus-visible:outline-none',
                'disabled:pointer-events-none disabled:opacity-40',
                /* O item destrutivo ganha o fundo tingido de forma PERMANENTE,
                   não só no hover. Não é enfeite: o vermelho foi calibrado
                   para `surface`, e o menu vive em `raised`, que é mais claro
                   no tema escuro — medido, o texto caía para 4,84:1, abaixo
                   dos 7:1 que o resto do sistema sustenta. Sobre `danger-bg` o
                   par volta a 7,5:1, e de quebra a linha que apaga dado passa
                   a se distinguir das outras sem depender só da cor da letra. */
                item.destructive
                  ? 'bg-danger-bg text-danger hover:brightness-95 focus-visible:brightness-95'
                  : 'text-ink-900 hover:bg-sunken focus-visible:bg-sunken',
              )}
            >
              {item.icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
