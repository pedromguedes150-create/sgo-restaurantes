import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { sessaoDaApi, mesDaUrl } from '@/lib/api-global/computados';
import { getUsageBoard } from '@/lib/supervisor/usage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/uso?mes=AAAA-MM — o painel de uso por unidade (Rotina do
 * Supervisor, Painel da unidade, Visão Executiva), pela MESMA função da tela.
 */
export const GET = comApiKey(async (req, cliente) => {
  const mes = mesDaUrl(new URL(req.url));
  const board = await getUsageBoard(sessaoDaApi(cliente), mes);
  return NextResponse.json({
    mes, total: board.length, dados: board,
    cobertura: { de: null, ate: null, registrosNoTotal: board.length, observacao: 'Calculado a cada chamada sobre o mês pedido (uma linha por unidade ativa). Percentuais de cobertura = dias lançados ÷ dias decorridos.' },
    fonte: 'calculado por getUsageBoard sobre task_instances, waste_entries, command_counts, occurrences, received_notes, cash_vault_movements e a meta; não é tabela',
  });
});
