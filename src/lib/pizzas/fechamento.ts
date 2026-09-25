import { format, subDays } from 'date-fns';
import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { unidadePorToken } from '@/lib/pizzas/acesso';
import {
  CANAIS, DIAS_RETROATIVOS, FORMATO_DATA, TAMANHOS, contagensDeLinhas, contagensVazias, emBR,
  linhasDeContagem, quantidadeValida, totalGeral,
  type ContagensDoFechamento,
} from '@/lib/pizzas/tipos';

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
  /** As seis quantidades do fechamento novo. */
  contagens: ContagensDoFechamento;
  /**
   * Linhas por SABOR dos fechamentos antigos. Vazio nos novos — mas o dia
   * antigo continua abrindo com o que foi lançado, em vez de parecer vazio.
   */
  items: ItemSalvo[];
  atualizadoEm: Date;
}

export type MotivoRecusa = 'TOKEN' | 'DATA' | 'QUANTIDADES' | 'VAZIO' | 'DUPLICADO';

export type ResultadoFechamento =
  | { ok: true; closingId: string; operationalDate: string; substituiu: boolean; total: number }
  | { ok: false; reason: MotivoRecusa };

/** O fechamento já gravado para um dia, ou null. */
export async function fechamentoDoDia(unitId: string, operationalDate: string): Promise<FechamentoSalvo | null> {
  const c = await prisma.pizzaClosing.findUnique({
    where: { unitId_operationalDate: { unitId, operationalDate } },
    include: {
      items: { orderBy: [{ size: 'desc' }, { flavorName: 'asc' }] },
      counts: true,
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    operationalDate: c.operationalDate,
    observation: c.observation,
    atualizadoEm: c.updatedAt,
    contagens: contagensDeLinhas(c.counts),
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
    contagens: ContagensDoFechamento;
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

  const contagens = normalizarContagens(input.contagens);
  if (!contagens) return { ok: false, reason: 'QUANTIDADES' };

  /* Fechamento com as seis em zero é RECUSADO — e não é capricho: o painel
     calcula a média por DIA LANÇADO justamente porque dia sem fechamento é
     dado que falta, não venda zero. Gravar um dia de zero pizzas entraria na
     conta e afundaria a média com um dia em que a pizzaria não vendeu porque
     não abriu. Dia sem venda é dia sem fechamento. */
  const total = totalGeral(contagens);
  if (total === 0) return { ok: false, reason: 'VAZIO' };

  const existente = await prisma.pizzaClosing.findUnique({
    where: { unitId_operationalDate: { unitId: unit.id, operationalDate } },
    select: { id: true },
  });
  if (existente && !input.substituir) return { ok: false, reason: 'DUPLICADO' };

  const observation = input.observation?.trim()?.slice(0, 500) || null;
  const closing = await escreverFechamento(unit.id, operationalDate, contagens, observation, {});

  const substituiu = Boolean(existente);

  await audit({
    userId: null, // link público: não há sessão, e inventar um autor seria pior
    unitId: unit.id,
    action: substituiu ? 'PIZZA_CLOSING_UPDATE' : 'PIZZA_CLOSING_CREATE',
    module: 'PIZZAS',
    entity: 'pizza_closing',
    entityId: closing.id,
    metadata: {
      operationalDate,
      total,
      teknisa: totalDoCanalAuditoria(contagens, 'TEKNISA'),
      ifood: totalDoCanalAuditoria(contagens, 'IFOOD'),
      origem: 'link-publico',
    },
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

/** Só para a metadata da auditoria não depender de import extra na leitura. */
function totalDoCanalAuditoria(c: ContagensDoFechamento, canal: 'TEKNISA' | 'IFOOD'): number {
  return TAMANHOS.reduce((t, tam) => t + (c[canal]?.[tam.valor] ?? 0), 0);
}

/**
 * As seis quantidades, validadas uma a uma — `null` se alguma for inválida.
 * Zero é valor legítimo em cada campo (vender só por um canal num dia é normal);
 * o que se recusa é não-inteiro, negativo, absurdo ou tipo errado. Campo AUSENTE
 * vira zero antes da validação.
 */
function normalizarContagens(entrada: ContagensDoFechamento | undefined): ContagensDoFechamento | null {
  const contagens = contagensVazias();
  for (const canal of CANAIS) {
    for (const tam of TAMANHOS) {
      const bruto = entrada?.[canal.valor]?.[tam.valor] ?? 0;
      if (!quantidadeValida(bruto)) return null;
      contagens[canal.valor][tam.valor] = Number(bruto);
    }
  }
  return contagens;
}

/**
 * Grava as seis contagens do dia — o núcleo comum ao link público e à correção
 * do supervisor. `createdById` só entra na CRIAÇÃO; ao corrigir um dia que já
 * existe, o autor original é preservado (quem corrigiu fica na Auditoria).
 * Apaga as linhas de sabor do dia (fechamentos antigos) para a mesma venda não
 * contar duas vezes no painel — só daquele dia, o resto do histórico fica.
 */
async function escreverFechamento(
  unitId: string,
  operationalDate: string,
  contagens: ContagensDoFechamento,
  observation: string | null,
  opts: { createdById?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.pizzaClosing.upsert({
      where: { unitId_operationalDate: { unitId, operationalDate } },
      create: { unitId, operationalDate, observation, createdById: opts.createdById ?? null },
      update: { observation },
    });
    await tx.pizzaClosingCount.deleteMany({ where: { closingId: c.id } });
    await tx.pizzaClosingCount.createMany({
      data: linhasDeContagem(contagens).map((l) => ({ closingId: c.id, channel: l.channel, size: l.size, quantity: l.quantity })),
    });
    await tx.pizzaClosingItem.deleteMany({ where: { closingId: c.id } });
    return c;
  });
}

/* ─────────────── Correção pelo SUPERVISOR (autenticada) ───────────────
 *
 * A mesma gravação do link, por outra porta. Existe porque o fechamento é
 * lançado sem login pela pizzaria, e um erro do funcionário só se corrige pelo
 * próprio link — o supervisor não tinha por onde auditar e consertar de dentro
 * do SGO. Aqui QUALQUER dia até hoje pode ser corrigido, e corrigir um dia que
 * já tem fechamento EXIGE motivo (a Auditoria registra por que mudou e quem).
 */
export type MotivoRecusaSessao = 'FORBIDDEN' | 'DATA' | 'QUANTIDADES' | 'VAZIO' | 'MOTIVO';
export type ResultadoFechamentoSessao =
  | { ok: true; closingId: string; operationalDate: string; substituiu: boolean; total: number }
  | { ok: false; reason: MotivoRecusaSessao };

const CORRIGE_FECHAMENTO: SessionUser['role'][] = ['MANAGER', 'SUPERVISOR', 'ADMIN', 'CEO'];

/** Porta autenticada: perfil que pode corrigir + acesso à unidade. */
export async function portaDeFechamento(
  user: SessionUser,
  unitId: string,
): Promise<{ unit: { id: string; name: string; timezone: string; cutoffHour: number }; hoje: string } | null> {
  if (!CORRIGE_FECHAMENTO.includes(user.role)) return null;
  if (!canAccessUnit(user, unitId)) return null;
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, name: true, timezone: true, cutoffHour: true } });
  if (!unit) return null;
  return { unit, hoje: currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }) };
}

export async function salvarFechamentoSessao(
  user: SessionUser,
  input: { unitId: string; operationalDate: string; contagens: ContagensDoFechamento; observation?: string | null; motivo?: string | null },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoFechamentoSessao> {
  const porta = await portaDeFechamento(user, input.unitId);
  if (!porta) return { ok: false, reason: 'FORBIDDEN' };
  const { unit, hoje } = porta;

  // Futuro nunca; sem piso de 30 dias (aquele existe porque o LINK é anônimo).
  if (!FORMATO_DATA.test(input.operationalDate) || input.operationalDate > hoje) return { ok: false, reason: 'DATA' };

  const contagens = normalizarContagens(input.contagens);
  if (!contagens) return { ok: false, reason: 'QUANTIDADES' };
  const total = totalGeral(contagens);
  if (total === 0) return { ok: false, reason: 'VAZIO' };

  const existente = await prisma.pizzaClosing.findUnique({
    where: { unitId_operationalDate: { unitId: unit.id, operationalDate: input.operationalDate } },
    select: { id: true },
  });
  const motivo = input.motivo?.trim() || null;
  // Corrigir um fechamento que JÁ existe exige motivo — é o que a auditoria registra.
  if (existente && !motivo) return { ok: false, reason: 'MOTIVO' };

  const observation = input.observation?.trim()?.slice(0, 500) || null;
  const closing = await escreverFechamento(unit.id, input.operationalDate, contagens, observation, {
    createdById: existente ? undefined : user.id,
  });
  const substituiu = Boolean(existente);

  await audit({
    userId: user.id,
    unitId: unit.id,
    action: substituiu ? 'PIZZA_CLOSING_UPDATE' : 'PIZZA_CLOSING_CREATE',
    module: 'PIZZAS',
    entity: 'pizza_closing',
    entityId: closing.id,
    metadata: {
      operationalDate: input.operationalDate,
      total,
      teknisa: totalDoCanalAuditoria(contagens, 'TEKNISA'),
      ifood: totalDoCanalAuditoria(contagens, 'IFOOD'),
      origem: 'supervisor',
      motivo,
    },
    ...ctx,
  });

  /* Avisa o gerente da unidade que o fechamento foi corrigido — a menos que o
     próprio autor seja o gerente, que já sabe. Mesma lógica do link. */
  if (substituiu && user.role !== 'MANAGER') {
    await notifyUnitRole(unit.id, 'MANAGER', {
      title: 'Fechamento de pizzas corrigido',
      body: `${unit.name}: o fechamento de ${emBR(input.operationalDate)} foi corrigido por ${user.name} e agora soma ${total} pizzas.`,
      link: `/modulos/pizzas?data=${input.operationalDate}`,
      module: 'PIZZAS',
      critical: false,
    }).catch(() => {});
  }

  return { ok: true, closingId: closing.id, operationalDate: input.operationalDate, substituiu, total };
}
