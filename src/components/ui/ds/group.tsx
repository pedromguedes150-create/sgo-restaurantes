import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lista agrupada do iOS (Onda 8).
 *
 * O QUE MUDA
 * O sistema empilhava cartões soltos: cada item com borda própria, canto
 * arredondado e um vão entre eles. O iOS usa UM contêiner arredondado com fios
 * separando as linhas por dentro. É a diferença estrutural mais visível entre
 * "web app" e "app de iPhone" — muda a silhueta da tela inteira, não um detalhe.
 *
 * De quebra é mais compacto: N cartões soltos gastam (N-1) vãos + 2N bordas.
 * Aqui é uma borda só e um fio de 1px entre linhas.
 *
 * COMO USAR
 * Troque o invólucro da pilha e tire do filho a borda/fundo/arredondamento —
 * quem desenha a caixa agora é o Group:
 *
 *   - <div className="space-y-2">
 *   -   <div className="rounded-lg border bg-surface p-3">…</div>
 *   + <Group>
 *   +   <div className="p-3">…</div>
 *
 * O QUE NÃO ENTRA AQUI
 * Cartão que usa a borda para SINALIZAR estado (`border-2 border-danger/60`,
 * uma caixa de alerta) não é linha de lista: é destaque. Perderia o sinal ao
 * virar linha. Esses ficam como estão.
 */
export function Group({
  children,
  className,
  inset = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Fio recuado 16px à esquerda (padrão do iOS). `false` = fio de ponta a ponta. */
  inset?: boolean;
}) {
  // Lista vazia não desenha caixa. Sem isto, `<Group>{itens.map(…)}</Group>` com
  // zero itens deixava um retângulo com borda e nada dentro na tela — apareceu
  // em Minha Área, num usuário sem folga registrada. A guarda fica AQUI e não em
  // cada chamada: são doze e viriam mais.
  const vazio = React.Children.toArray(children).length === 0;
  if (vazio) return null;

  return (
    <div
      className={cn(
        'sgo-group overflow-hidden rounded-card border border-line bg-surface',
        !inset && 'sgo-group-flush',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Cabeçalho de seção acima de um Group — o rótulo em caixa alta do iOS, que
 * vive FORA da caixa e não dentro dela.
 */
export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="sgo-type-11 mb-1.5 px-4 text-ink-500">{children}</p>;
}
