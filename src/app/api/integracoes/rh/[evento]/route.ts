import { NextResponse } from 'next/server';
import { inboundAuthorized, handleInclusao, handleDesligamento, handlePeriodoAquisitivo } from '@/lib/rh/inbound';

export const dynamic = 'force-dynamic';

/**
 * Recepção RH→SGO (v1.16.0). URLs para configurar no painel do RH:
 *   POST /api/integracoes/rh/inclusao
 *   POST /api/integracoes/rh/desligamento
 *   POST /api/integracoes/rh/periodo-aquisitivo
 *   POST /api/integracoes/rh/exclusao-periodo
 * Autenticação: Authorization: Bearer <RH_INBOUND_TOKEN> (ou x-api-key).
 */
export async function POST(req: Request, { params }: { params: { evento: string } }) {
  if (!inboundAuthorized(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload || typeof payload !== 'object') return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });

  const evento = params.evento.toLowerCase();
  let r;
  if (evento === 'inclusao') r = await handleInclusao(payload);
  else if (evento === 'desligamento') r = await handleDesligamento(payload);
  else if (evento === 'periodo-aquisitivo' || evento === 'periodo_aquisitivo') r = await handlePeriodoAquisitivo('periodo_aquisitivo', payload);
  else if (evento === 'exclusao-periodo' || evento === 'exclusao_periodo') r = await handlePeriodoAquisitivo('exclusao_periodo', payload);
  else return NextResponse.json({ error: `Evento desconhecido: ${evento}` }, { status: 404 });

  return NextResponse.json(r.body, { status: r.httpStatus });
}
