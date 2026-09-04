import { NextResponse } from 'next/server';
import { canEditModule } from '@/lib/permissions';
import type { Role } from '@prisma/client';

/**
 * A recusa no servidor para aba fechada.
 *
 * Esconder a aba é conveniência; recusar aqui é o controle. Sem isto, fechar
 * "Pagar" para um perfil só tiraria o botão — a requisição continuaria valendo.
 *
 * O mapa liga a AÇÃO que a rota recebe à aba dona dela. Ação que não está aqui
 * não é checada, de propósito: rota de leitura (o `context` dos Desligamentos,
 * por exemplo) não pode ser barrada por uma regra de gravação.
 */
const ACAO_DA_ABA: Record<string, Record<string, string>> = {
  CASH: {
    count: 'CASH_TAB_VAULT',
    refill: 'CASH_TAB_VAULT',
    officeSwap: 'CASH_TAB_VAULT',
    withdrawal: 'CASH_TAB_VAULT',
    registerChange: 'CASH_TAB_VAULT',
    requestChange: 'CASH_TAB_VAULT',
    sendChange: 'CASH_TAB_VAULT',
    confirmReceipt: 'CASH_TAB_VAULT',
    resolveChange: 'CASH_TAB_VAULT',
    bucketSet: 'CASH_TAB_VAULT',
    bucketToggle: 'CASH_TAB_VAULT',
    bucketDelete: 'CASH_TAB_VAULT',
  },
  PRODUCTS: {
    order: 'PRODUCTS_TAB_NEW',
    status: 'PRODUCTS_TAB_OPS',
    // o catálogo mora em Configurações, embora a rota seja a mesma
    catUpsert: 'CONFIG_PRODUCTS',
    catDelete: 'CONFIG_PRODUCTS',
    catToggle: 'CONFIG_PRODUCTS',
  },
  TERMINATIONS: {
    create: 'TERMINATIONS_TAB_NEW',
    decide: 'TERMINATIONS_TAB_LIST',
  },
  SCHEDULE: {
    setActual: 'SCHEDULE_TAB_ACTUAL',
    clearActual: 'SCHEDULE_TAB_ACTUAL',
    fill: 'SCHEDULE_TAB_PLANNED',
    savePattern: 'SCHEDULE_TAB_PLANNED',
    deletePattern: 'SCHEDULE_TAB_PLANNED',
  },
  SUPERVISION: {
    schedule: 'SUPERVISION_TAB_VISITS',
    complete: 'SUPERVISION_TAB_VISITS',
    cancel: 'SUPERVISION_TAB_VISITS',
    setPlan: 'SUPERVISION_TAB_VISITS',
  },
  INVENTORY: {
    // a rota do inventário usa entidade + ação
    'movement:create': 'INVENTORY_TAB_MOVE',
  },
  GAS: {
    edit: 'GAS_TAB_HISTORY',
  },
};

/**
 * Recusa (403) se a aba dona da ação estiver fechada para o perfil.
 * Devolve `null` quando pode seguir — o padrão para ação não mapeada.
 */
export async function recusaDeAba(role: Role, modulo: string, acao: string): Promise<NextResponse | null> {
  const chave = ACAO_DA_ABA[modulo]?.[acao];
  if (!chave) return null;
  if (await canEditModule(role, chave)) return null;
  return NextResponse.json({ error: 'Sem permissão', reason: 'FORBIDDEN' }, { status: 403 });
}

/**
 * Recusa (403) se a ABA indicada estiver fechada — para rota de propósito
 * único, que não recebe "ação" nenhuma (lançar atestado, lançar coleta…).
 */
export async function recusaSeAbaFechada(role: Role, chaveDaAba: string): Promise<NextResponse | null> {
  if (await canEditModule(role, chaveDaAba)) return null;
  return NextResponse.json({ error: 'Sem permissão', reason: 'FORBIDDEN' }, { status: 403 });
}
