import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { alertasDeHigiene } from '@/lib/hygiene';

/**
 * Avisos de banheiro em aberto mais novos que `?desde=` no alcance de quem
 * pergunta (v1.156.0) — o "apito" do SGO aberto. Leitura leve, a cada 20s.
 * Devolve `agora` para a próxima pergunta começar de onde esta parou.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const agora = new Date();
  const q = new URL(req.url).searchParams.get('desde');
  const desde = q && !Number.isNaN(Date.parse(q)) ? new Date(q) : new Date(agora.getTime() - 60_000);
  // nunca olha mais de 1h para trás: abrir o SGO de manhã não pode apitar a noite inteira
  const piso = new Date(agora.getTime() - 3_600_000);
  const avisos = await alertasDeHigiene(user, desde < piso ? piso : desde);
  return NextResponse.json({ avisos, agora: agora.toISOString() });
}
