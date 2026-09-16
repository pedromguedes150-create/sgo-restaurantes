import { format, subDays } from 'date-fns';
import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import { saboresAtivos, unidadePorToken } from '@/lib/pizzas/acesso';
import { DIAS_RETROATIVOS, FORMATO_DATA, ehTamanho, emBR, totalDePizzas, type ItemDeFechamento } from '@/lib/pizzas/tipos';

/**
 * Fechamento de pizzas do dia, preenchido pelo LINK PÚBLICO (sem login).
 *
 * A unidade sai sempre do token — nunca do corpo da requisição. Quem abre o
 * link não escolhe nem troca a unidade, e mexer no JSON pelo navegador não
 * muda isso.
 */

export interface ItemSalvo {
  size: string;
  flavorId: string;
  flavorName: string;
  quantity: number;
}

export interface FechamentoSalvo {
  id: string;
  operationalDate: string;
  observation: string | null;
  items: ItemSalvo[];
  atualizadoEm: Date;
}

export type MotivoRecusa = 'TOKEN' | 'DATA' | 'ITENS' | 'DUPLICADO';

export type ResultadoFechamento =
  | { ok: true; closingId: string; operationalDate: string; substituiu: boolean; total: number }
  | { ok: false; reason: MotivoRecusa };

/** O fechamento já gravado para um dia, ou null. */
export async function fechamentoDoDia(unitId: string, operationalDate: string): Promise<FechamentoSalvo | null> {
  const c = await prisma.pizzaClosing.findUnique({
    where: { unitId_operationalDate: { unitId, operationalDate } },
    include: { items: { orderBy: [{ size: 'desc' }, { flavorName: 'asc' }] } },
  });
  if (!c) return null;
  return {
    id: c.id,
    operationalDate: c.operationalDate,
    observation: c.observation,
    atualizadoEm: c.updatedAt,
    items: c.items.map((i) => ({ size: i.size, flavorId: i.flavorId, flavorName: i.flavorName, quantity: i.quantity })),
  };
}

/**
 * Grava (ou corrige) o fechamento do dia.
 *
 * `substituir` é o aceite explícito da correção: sem ele, um dia que já tem
 * fechamento é recusado com DUPLICADO para a tela poder avisar e mostrar o que
 * já foi lançado, em vez de sobrescrever calado o trabalho de outra pessoa.
 */
export async function salvarFechamento(
  input: {
    token: string;
    operationalDate?: string;
    items: ItemDeFechamento[];
    observation?: string | null;
    substituir?: boolean;
  },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoFechamento> {
  const unit = await unidadePorToken(input.token);
  if (!unit) return { ok: false, reason: 'TOKEN' };

  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  let operationalDate = hoje;
  if (input.operationalDate) {
    if (!FORMATO_DATA.test(input.operationalDate)) return { ok: false, reason: 'DATA' };
    // Futuro nunca: fechamento é do que já foi vendido.
    if (input.operationalDate > hoje) return { ok: false, reason: 'DATA' };
    const limite = format(subDays(new Date(`${hoje}T12:00:00`), DIAS_RETROATIVOS), 'yyyy-MM-dd');
    if (input.operationalDate < limite) return { ok: false, reason: 'DATA' };
    operationalDate = input.operationalDate;
  }

  // Só sabores do catálogo ATIVO desta unidade. Um flavorId de outra unidade
  // faria o item vazar de pizzaria — e a FK sozinha não impediria isso.
  const sabores = await saboresAtivos(unit.id);
  const nomePorId = new Map(sabores.map((s) => [s.id, s.name]));

  // Mesma combinação tamanho+sabor digitada duas vezes SOMA: é o que a pessoa
  // quis dizer, e deixar passar violaria a unique com um 500 na cara dela.
  const porChave = new Map<string, { size: string; flavorId: string; flavorName: string; quantity: number }>();
  for (const item of input.items ?? []) {
    if (!ehTamanho(item.size)) return { ok: false, reason: 'ITENS' };
    const flavorName = nomePorId.get(item.flavorId);
    if (!flavorName) return { ok: false, reason: 'ITENS' };
    const qtd = Number(item.quantity);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 10_000) return { ok: false, reason: 'ITENS' };
    const chave = `${item.size}|${item.flavorId}`;
    const atual = porChave.get(chave);
    if (atual) atual.quantity += qtd;
    else porChave.set(chave, { size: item.size, flavorId: item.flavorId, flavorName, quantity: qtd });
  }
  const itens = [...porChave.values()];
  if (itens.length === 0) return { ok: false, reason: 'ITENS' };

  const existente = await prisma.pizzaClosing.findUnique({
    where: { unitId_operationalDate: { unitId: unit.id, operationalDate } },
    select: { id: true },
  });
  if (existente && !input.substituir) return { ok: false, reason: 'DUPLICADO' };

  const observation = input.observation?.trim()?.slice(0, 500) || null;
  const closing = await prisma.$transaction(async (tx) => {
    const c = await tx.pizzaClosing.upsert({
      where: { unitId_operationalDate: { unitId: unit.id, operationalDate } },
      create: { unitId: unit.id, operationalDate, observation },
      update: { observation },
    });
    await tx.pizzaClosingItem.deleteMany({ where: { closingId: c.id } });
    await tx.pizzaClosingItem.createMany({
      data: itens.map((i) => ({
        closingId: c.id,
        size: i.size as 'CM25' | 'CM30' | 'CM35',
        flavorId: i.flavorId,
        flavorName: i.flavorName,
        quantity: i.quantity,
      })),
    });
    return c;
  });

  const total = totalDePizzas(itens);
  const substituiu = Boolean(existente);

  await audit({
    userId: null, // link público: não há sessão, e inventar um autor seria pior
    unitId: unit.id,
    action: substituiu ? 'PIZZA_CLOSING_UPDATE' : 'PIZZA_CLOSING_CREATE',
    module: 'PIZZAS',
    entity: 'pizza_closing',
    entityId: closing.id,
    metadata: { operationalDate, total, linhas: itens.length, origem: 'link-publico' },
    ...ctx,
  });

  /* Só a CORREÇÃO avisa. Um aviso por fechamento normal seria ruído diário; a
     reescrita de um dia já fechado é justamente o que o gerente precisa ver. */
  if (substituiu) {
    await notifyUnitRole(unit.id, 'MANAGER', {
      title: 'Fechamento de pizzas corrigido',
      body: `${unit.name}: o fechamento de ${emBR(operationalDate)} foi refeito pelo link e agora soma ${total} pizzas.`,
      link: `/modulos/pizzas?data=${operationalDate}`,
      module: 'PIZZAS',
      critical: false,
    }).catch(() => {});
  }

  return { ok: true, closingId: closing.id, operationalDate, substituiu, total };
}
