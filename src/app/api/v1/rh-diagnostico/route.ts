import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { sessaoDaApi } from '@/lib/api-global/computados';
import { diagnosticarUnidade, unidadesDoDiagnostico } from '@/lib/rh/diagnostico';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/rh-diagnostico?unidade=<id> — o Diagnóstico do RH de uma unidade,
 * pela MESMA função da tela: consulta a API externa do RH AO VIVO e compara com
 * os colaboradores do SGO. Sem `unidade`, lista as unidades diagnosticáveis.
 */
export const GET = comApiKey(async (req, cliente) => {
  const url = new URL(req.url);
  const unidade = url.searchParams.get('unidade');
  const sessao = sessaoDaApi(cliente);
  if (!unidade) {
    const unidades = await unidadesDoDiagnostico(sessao);
    return NextResponse.json({ total: unidades.length, dados: unidades, detail: 'Informe ?unidade=<id> para o diagnóstico de uma unidade.', fonte: 'units (ativas) — o diagnóstico em si consulta a API externa do RH ao vivo' });
  }
  const d = await diagnosticarUnidade(sessao, unidade);
  if (!d) return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 });
  return NextResponse.json({ ...d, fonte: 'API externa do RH (gbf-rh) × collaborators, ao vivo — a mesma leitura da tela Configurações → Diagnóstico do RH' });
});
