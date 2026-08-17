'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * SegmentedControl do design system (Onda 2, reescrito na Onda 8).
 * Trilho afundado + segmento eleito em pílula ELEVADA, como no iOS.
 * A11y: radiogroup + radio; ←/→ movem e já selecionam (padrão de rádio).
 *
 * Duas coisas mudaram na Onda 8, as duas por motivo concreto:
 *
 * 1. A pílula era um <span> absoluto que DESLIZAVA com
 *    `translateX(indice * 100%)`. Isso só fecha se todos os segmentos tiverem
 *    a mesma largura, e por isso cada um levava `flex-1`. Mas os rótulos daqui
 *    são frases em português — "Lançar recebimento", "Para Aprovar", "Painel &
 *    Histórico" — e há telas com cinco abas: num celular de 375px dá 75px por
 *    segmento e o texto vaza (há `whitespace-nowrap`, então ele não quebra).
 *    Agora cada segmento tem a largura do seu texto e o trilho ROLA quando não
 *    couber, que é o que o iOS faz numa fileira de filtros longa. No desktop,
 *    onde tudo cabe, não há rolagem e nada muda.
 *
 * 2. Some o span deslizante: a pílula é o PRÓPRIO botão ativo. Cheguei a
 *    implementar a versão que mede o segmento com offsetLeft/offsetWidth +
 *    ResizeObserver (é o que libera largura variável mantendo o deslize), mas
 *    não consegui verificá-la: o navegador desta sessão não aplica estilo
 *    inline neste elemento — o atributo diz `width: 77px`, o computado insiste
 *    em 67px, e escrever o mesmo valor à mão via CSSOM também não pega. Sem
 *    poder provar que a pílula pousa no lugar, não dá para espalhar isso por
 *    21 telas. Pintar o botão ativo não tem o que dar errado: nenhuma medida,
 *    nenhum efeito, funciona com qualquer rótulo, e em repouso — que é o que
 *    se olha — o desenho é idêntico. O preço é o deslize, que virou
 *    transição de cor.
 */
/**
 * `badgeTone`: 'danger' para contador que cobra ação (pendências vencendo,
 * pedidos parados). Existe porque algumas telas já pintavam esse número de
 * vermelho na versão à mão, e trocar por um badge neutro apagaria a urgência
 * em silêncio — o número continua lá, só deixa de gritar.
 */
export interface SegmentOption<T extends string> { value: T; label: string; badge?: number; badgeTone?: 'neutral' | 'danger' }

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onValueChange: (v: T) => void;
  size?: 'sm' | 'md';
  'aria-label': string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options, value, onValueChange, size = 'md', className, ...rest
}: SegmentedControlProps<T>) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  /* Se o trilho rolou, traz o ativo para o campo de visão — senão a aba
     selecionada pode ficar fora da tela depois de uma troca por teclado. */
  React.useEffect(() => {
    refs.current[idx]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [idx]);

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (idx + dir + options.length) % options.length;
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      onKeyDown={onKeyDown}
      className={cn(
        'sgo-control sgo-sem-barra flex max-w-full items-stretch gap-1 overflow-x-auto rounded-pill bg-sunken p-1',
        size === 'sm' ? 'h-9' : 'h-11',
        className,
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            className={cn(
              'flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 font-medium outline-none',
              'transition-[background-color,color,box-shadow] duration-sgo-2 ease-sgo-std',
              'focus-visible:shadow-sgo-focus motion-reduce:transition-none',
              size === 'sm' ? 'text-[13px]' : 'text-[14px]',
              /* `bg-raised`, não `bg-surface`: no tema escuro `surface`
                 (31 28 27) é mais ESCURO que o trilho `sunken` (42 38 36),
                 então a pílula eleita AFUNDAVA em vez de subir — o inverso do
                 que a elevação promete. Medido nas duas instâncias da galeria
                 antes de trocar. */
              active
                ? 'bg-raised text-ink-900 shadow-sgo-raised'
                : 'text-ink-500 hover:text-ink-700',
            )}
          >
            {o.label}
            {o.badge != null && o.badge > 0 && (
              <span
                className={cn(
                  'rounded-pill px-1.5 text-[11px] font-bold tabular-nums',
                  o.badgeTone === 'danger'
                    ? 'bg-danger text-on-brand'
                    : active ? 'bg-brand text-on-brand' : 'bg-line-strong text-ink-700',
                )}
              >
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
