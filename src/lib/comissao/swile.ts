import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { arredondar2 } from './calculo';

/**
 * PEDIDO DE CARGA SWILE (v1.176.0) — o arquivo que a Swile aceita para
 * carregar o cartão: "Nome · CPF · Saldo Livre · Mobilidade · Refeição e
 * Alimentação" (modelo "Pedido de Carga Swile - Customizado" enviado pelo
 * Pedro, 20/10/2026). A comissão da competência vai em **Saldo Livre**, uma
 * linha por PESSOA (os lançamentos da mesma pessoa somam), as outras duas
 * colunas vazias — é assim que o modelo veio.
 *
 * CPF sai do CADASTRO na hora (nunca do lançamento) e só com dígitos. Quem
 * não tem CPF no RH não pode ser carregado: fica numa aba à parte ("Sem CPF")
 * para alguém completar o cadastro, em vez de sumir do arquivo em silêncio.
 */

export const COLUNAS_SWILE = ['Nome', 'CPF', 'Saldo Livre', 'Mobilidade', 'Refeição e Alimentação'] as const;
export const ABA_SWILE = 'Pedido de Carga Swile';

export interface LinhaSwile { nome: string; cpf: string; valor: number; unidade: string }

export interface PedidoSwile {
  competencia: string;
  linhas: LinhaSwile[];
  semCpf: LinhaSwile[];
  total: number;
}

export const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Junta os lançamentos por pessoa e separa quem não tem CPF (PURO). */
export function montarPedidoSwile(
  competencia: string,
  lancamentos: { collaboratorId: string; collaboratorName: string; amount: number; unidade: string }[],
  cadastro: Map<string, { name: string; cpf: string | null }>,
): PedidoSwile {
  const porPessoa = new Map<string, LinhaSwile>();
  for (const l of lancamentos) {
    const c = cadastro.get(l.collaboratorId);
    const atual = porPessoa.get(l.collaboratorId) ?? { nome: c?.name ?? l.collaboratorName, cpf: soDigitos(c?.cpf), valor: 0, unidade: l.unidade };
    atual.valor = arredondar2(atual.valor + l.amount);
    porPessoa.set(l.collaboratorId, atual);
  }
  const todas = [...porPessoa.values()].filter((l) => l.valor > 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const linhas = todas.filter((l) => l.cpf.length === 11);
  const semCpf = todas.filter((l) => l.cpf.length !== 11);
  return { competencia, linhas, semCpf, total: arredondar2(linhas.reduce((s, l) => s + l.valor, 0)) };
}

/** Os lançamentos de Comissão da competência, no alcance do usuário (e, se pedido, de uma unidade). */
export async function getPedidoSwile(user: SessionUser, competencia: string, unitId?: string | null): Promise<PedidoSwile> {
  const lancamentos = await prisma.collaboratorPayout.findMany({
    where: { type: 'COMMISSION', yearMonth: competencia, ...unitScopeWhere(user, 'unitId'), ...(unitId ? { unitId } : {}) },
    select: { collaboratorId: true, collaboratorName: true, amount: true, unitId: true },
  });
  const [colaboradores, unidades] = await Promise.all([
    prisma.collaborator.findMany({ where: { id: { in: [...new Set(lancamentos.map((l) => l.collaboratorId))] } }, select: { id: true, name: true, cpf: true } }),
    prisma.unit.findMany({ where: { id: { in: [...new Set(lancamentos.map((l) => l.unitId))] } }, select: { id: true, name: true } }),
  ]);
  const cadastro = new Map(colaboradores.map((c) => [c.id, { name: c.name, cpf: c.cpf }]));
  const nomeDaUnidade = new Map(unidades.map((u) => [u.id, u.name]));
  return montarPedidoSwile(competencia, lancamentos.map((l) => ({ collaboratorId: l.collaboratorId, collaboratorName: l.collaboratorName, amount: Number(l.amount), unidade: nomeDaUnidade.get(l.unitId) ?? '—' })), cadastro);
}
