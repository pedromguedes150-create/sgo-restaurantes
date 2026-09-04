import { podeAba, type AcessoAbas } from '@/lib/permissions/abas';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';

/**
 * As três abas do topo de Notas Recebidas.
 *
 * Viraram navegação, não estado: o gás passou a ter rota própria, e um trilho
 * onde dois segmentos trocam estado e o terceiro navega seria mentiroso — o
 * mesmo controle precisa se comportar igual nos três. De quebra, cada aba
 * ganhou endereço: dá para voltar pelo botão do navegador e mandar link de uma
 * aba específica, o que antes não existia.
 *
 * O período (`?dias=`) é preservado ao trocar de aba — perder o filtro no
 * caminho é o tipo de coisa que faz a pessoa desistir de usar filtro.
 */
export function NotesTabs({ value, sinceDays, abas = {}, podeGas = true }: { value: 'lista' | 'venc' | 'gas'; sinceDays?: number;
  /** Abas liberadas para o perfil (Configurações → Perfis de acesso). */
  abas?: AcessoAbas;
  /** A análise de gás é tela própria: quem manda é a guarda de rota. */
  podeGas?: boolean;
}) {
  const dias = sinceDays && sinceDays !== 60 ? `dias=${sinceDays}` : '';
  const notas = `/modulos/notas${dias ? `?${dias}` : ''}`;
  const venc = `/modulos/notas?aba=venc${dias ? `&${dias}` : ''}`;

  return (
    <SegmentedNav
      aria-label="Seções de Notas Recebidas"
      value={value}
      options={[
        { value: 'lista', label: 'Notas', href: notas },
        { value: 'venc', label: 'Vencimentos', href: venc },
        { value: 'gas', label: 'Análise de gás', href: '/modulos/notas/gas' },
      ].filter((o) => (o.value === 'gas' ? podeGas : podeAba(abas, o.value)))}
    />
  );
}
