import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * A tela antiga do leitor (v1.39.0) foi DESATIVADA na v1.220.0.
 *
 * Ela gravava a contagem do dia sem criar o registro de conferência, então o
 * que era feito por aqui não aparecia em "Última conferência" nem no Histórico
 * — a gerente conferia nos dias 21 e 22 e a tela continuava mostrando o dia 20.
 * Agora existe UM caminho: "Iniciar conferência" na tela de Comandas (Leitor +
 * Manual na mesma conferência). O endereço fica para quem o tem salvo.
 */
export default function ConferenciaAntigaPage({ searchParams }: { searchParams: { unit?: string } }) {
  redirect(searchParams.unit ? `/modulos/comandas?unit=${encodeURIComponent(searchParams.unit)}` : '/modulos/comandas');
}
