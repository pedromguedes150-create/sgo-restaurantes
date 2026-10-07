import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { avisosDesde } from '@/lib/notifications';
import { nivelDoAviso } from '@/lib/notifications/nivel';

/**
 * Avisos novos do PRÓPRIO usuário desde `?desde=` (v1.158.0) — alimenta o aviso
 * ao vivo no topo da tela. Devolve `agora` para a próxima pergunta começar de
 * onde esta parou. Nunca olha mais de 1h para trás: abrir o SGO de manhã não
 * pode tocar os avisos da noite inteira (eles seguem no sino).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const agora = new Date();
  const q = new URL(req.url).searchParams.get('desde');
  const pedido = q && !Number.isNaN(Date.parse(q)) ? new Date(q) : new Date(agora.getTime() - 60_000);
  const piso = new Date(agora.getTime() - 3_600_000);
  const avisos = await avisosDesde(user, pedido < piso ? piso : pedido);
  return NextResponse.json({
    avisos: avisos.map((a) => ({ id: a.id, title: a.title, body: a.body, link: a.link, module: a.module, nivel: nivelDoAviso(a), createdAt: a.createdAt })),
    agora: agora.toISOString(),
  });
}
