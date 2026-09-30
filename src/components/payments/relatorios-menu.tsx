import Link from 'next/link';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Os relatórios e consolidações de Pagamentos — visíveis de cara.
 *
 * Primeira versão escondia os três atrás de um menu suspenso ("Relatórios de
 * Pagamentos ▾"): o Pedro usa "Recorrência de Freelancers" toda semana, e
 * enterrar um link de uso frequente atrás de um clique a mais TROCA a lógica
 * de navegação, não só a aparência — ele pediu para organizar a poluição
 * visual, não para esconder nada. A correção: os três continuam a UM clique,
 * exatamente como antes; só a AMOSTRA visual muda — em vez de três caixas
 * soltas com borda e ícone cada uma, viram uma tira só, com um ícone
 * compartilhado. A explicação de cada um (que estava na descrição do menu)
 * vira `title` — um tooltip nativo ao passar o mouse, não conteúdo escondido.
 */
export interface RelatorioDePagamentos {
  href: string;
  titulo: string;
  descricao: string;
}

export function RelatoriosMenu({ itens }: { itens: RelatorioDePagamentos[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-line-strong">
      <span className="flex items-center border-r border-line-strong bg-sunken px-2 text-ink-500" aria-hidden>
        <FileText className="h-4 w-4" />
      </span>
      {itens.map((item, i) => (
        <Link
          key={item.href}
          href={item.href}
          title={item.descricao}
          className={cn(
            'px-3 py-1.5 text-sm font-semibold text-ink-900 transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken',
            i > 0 && 'border-l border-line-strong',
          )}
        >
          {item.titulo}
        </Link>
      ))}
    </div>
  );
}
