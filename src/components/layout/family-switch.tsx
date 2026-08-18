import Link from 'next/link';

/**
 * Mostra a FAMÍLIA do módulo e leva aos irmãos.
 *
 * Começou como um menu suspenso e voltou atrás por dois motivos, o primeiro
 * grave:
 *
 * 1. O menu abria com os itens VAZIOS em produção — sem reproduzir no
 *    desenvolvimento. A causa provável era aninhamento inválido: o wrapper era
 *    <span> e o ActionMenu abre com <div>, e cada navegador recupera de HTML
 *    inválido de um jeito. Não fui capaz de reproduzir para provar, e é
 *    exatamente por isso que a peça saiu: não dá para deixar navegação
 *    dependendo de algo que falha e eu não sei explicar.
 *
 * 2. Popover para escolher entre DOIS ou TRÊS irmãos não compra nada. Custa um
 *    toque a mais, some da tela, e traz posicionamento, recorte, foco e teclado
 *    para resolver. Link é link: aparece, não precisa de estado e não tem o que
 *    quebrar.
 *
 * O peso visual fica baixo de propósito — isto é contexto ("você está em Caixa,
 * e ao lado tem estes"), não a ação principal da tela.
 */
export function FamilySwitch({
  familyTitle,
  siblings,
}: {
  familyTitle: string;
  /** Já filtrados por permissão no servidor, e sem a página atual. */
  siblings: { href: string; tab: string }[];
}) {
  if (siblings.length === 0) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-500">
      <span className="font-semibold uppercase tracking-wide">{familyTitle}</span>
      {siblings.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="rounded-control px-1.5 py-1 font-medium text-brand underline-offset-2 outline-none hover:underline focus-visible:shadow-sgo-focus"
        >
          {s.tab}
        </Link>
      ))}
    </p>
  );
}
