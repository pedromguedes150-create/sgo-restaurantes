import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { sessaoDaApi, mesDaUrl } from '@/lib/api-global/computados';
import { getMetaRanking, getMetaBreakdown } from '@/lib/metas/query';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/metas?mes=AAAA-MM — o ranking de metas do mês por unidade, pela
 * MESMA função da tela (getMetaRanking → getUnitMonthScore), com o
 * detalhamento por componente de cada unidade. Computado, não é tabela.
 */
export const GET = comApiKey(async (req, cliente) => {
  const mes = mesDaUrl(new URL(req.url));
  const ranking = await getMetaRanking(sessaoDaApi(cliente), mes);
  const detalhe = await Promise.all(ranking.map(async (r) => ({ ...r, componentes: await getMetaBreakdown(r.unitId, mes) })));
  return NextResponse.json({
    mes, total: ranking.length, dados: detalhe,
    cobertura: { de: null, ate: null, registrosNoTotal: ranking.length, observacao: 'A meta é calculada a cada chamada sobre o mês pedido; não há registros históricos — consulte `tarefas` para a cobertura das instâncias que a alimentam.' },
    fonte: 'calculado por getMetaRanking/getUnitMonthScore sobre task_instances (status DONE|LATE|MISSED|PENDING) e os pesos de app_settings; não é tabela',
  });
});
