import type { SessionUser } from '@/lib/auth/session';

/**
 * Quem pode lançar ou corrigir desperdício de um dia que NÃO é o dia
 * operacional de hoje — vale para as DUAS frentes (Restaurante e Salgados).
 *
 * Decisão do Pedro (14/10/2026): só o ADMINISTRADOR. O gerente lança o
 * desperdício NO DIA: a tela nem mostra o seletor de data para ele, e
 * `saveWasteEntry`/`saveSnackDay` aplicam ESTA função no servidor — a tela
 * não é porta, e um `?date=` montado à mão cai na mesma recusa.
 *
 * Módulo puro de propósito: a página, as gravações e os testes leem a mesma
 * regra sem arrastar o Prisma.
 */
export function podeLancarDiaAnterior(user: Pick<SessionUser, 'role'>): boolean {
  return user.role === 'ADMIN';
}
