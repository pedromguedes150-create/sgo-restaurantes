import Link from 'next/link';
import { FileText } from 'lucide-react';

/**
 * Os relatórios e consolidações de Pagamentos — visíveis de cara.
 *
 * Primeira versão escondia os três atrás de um menu suspenso ("Relatórios de
 * Pagamentos ▾"): o Pedro usa "Recorrência de Freelancers" toda semana, e
 * enterrar um link de uso frequente atrás de um clique a mais TROCA a lógica
 * de navegação, não só a aparência — ele pediu para organizar a poluição
 * visual, não para esconder nada. Os três continuam a UM clique; a explicação
 * de cada um vira `title` — tooltip nativo, não conteúdo escondido.
 *
 * Fase 4 do kit: cada relatório é um botão secundário do kit (`.sgo-btn`),
 * na linha de ações do cabeçalho da página.
 */
export interface RelatorioDePagamentos {
  href: string;
  titulo: string;
  descricao: string;
}

export function RelatoriosMenu({ itens }: { itens: RelatorioDePagamentos[] }) {
  if (itens.length === 0) return null;
  return (
    <>
      {itens.map((item) => (
        <Link key={item.href} href={item.href} title={item.descricao} className="sgo-btn">
          <FileText className="h-3.5 w-3.5" aria-hidden />
          {item.titulo}
        </Link>
      ))}
    </>
  );
}
