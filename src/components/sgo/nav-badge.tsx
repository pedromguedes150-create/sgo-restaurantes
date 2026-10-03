/**
 * Selo de notificação da navegação — componente ÚNICO para o sistema todo
 * (kit de layout, 3-componentes-sgo/NavBadge.tsx).
 *
 * A aparência é a mesma em qualquer item, inclusive no sino: a cor não varia
 * por módulo de propósito. Acima do teto mostra "<teto>+"; abaixo de 1 não
 * renderiza — quem chama não precisa repetir o `count > 0 &&`.
 * O visual inteiro está em .sgo-navbadge (sgo-kit.css, seção 20c).
 */
export function NavBadge({ count, cap = 99, testId }: { count: number; cap?: number; testId?: string }) {
  if (!count || count < 1) return null;
  return (
    <span className="sgo-navbadge" data-testid={testId}>
      {count > cap ? `${cap}+` : count}
    </span>
  );
}
