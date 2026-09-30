import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notifications';
import { dataDe, noPeriodo } from '@/lib/payments/consolidado';
import type { SessionUser } from '@/lib/auth/session';
import {
  limitesDoMes, mesTrabalhadoDa, rotuloDaCompetencia, somarPorColaborador,
  type HoraExtraDoQuadro,
} from '@/lib/people/pagamento-extra-calculo';
import type { GrupoDeUnidade, LinhaDaUnidade, QuadroDaCompetencia, ResultadoPayout } from '@/lib/people/payouts-competencia';

/**
 * PAGAMENTO EXTRA — as horas extras aprovadas, por competência.
 *
 * NADA é copiado para outra tabela. O quadro é DERIVADO de `payment_requests`
 * (tipo OVERTIME, aprovada ou paga) na hora de ler, com a competência sendo o
 * MÊS SEGUINTE ao dia trabalhado (`pagamento-extra-calculo.ts`). Copiar a HE
 * no momento da aprovação exigiria um gatilho para cada caminho que a altera
 * (correção do aprovador, exclusão pelo Admin, correção de data) — e é
 * esquecendo um deles que nascem as duas versões do mesmo número. Derivado, a
 * HE aparece uma vez só, sempre, e a já aprovada aparece no dia do deploy sem
 * rotina de migração.
 *
 * O que GRAVA são só a entrega por unidade e o fechamento (`PayoutDelivery` e
 * `PayoutClosure` com `type = EXTRA`) — e o fechamento marca as HE como PAGAS
 * em Pagamentos, porque a hora extra é paga pela competência (cartão), não por
 * PIX na aba Pagar.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Quem fecha a competência do Pagamento Extra: o ato é da REDE inteira e marca pagamentos. */
export const PODE_FECHAR_EXTRA = new Set(['ADMIN', 'CEO', 'FINANCE']);
export const podeFecharPagamentoExtra = (role: string) => PODE_FECHAR_EXTRA.has(role);

const centavos = (n: number) => Math.round(n * 100) / 100;

/** As HE do mês trabalhado, no escopo de quem pergunta. */
async function horasExtrasDoMes(user: SessionUser, mesTrabalhado: string, status: ('PENDING' | 'APPROVED' | 'PAID')[]) {
  const limites = limitesDoMes(mesTrabalhado)!;
  return prisma.paymentRequest.findMany({
    where: {
      type: 'OVERTIME',
      status: { in: status },
      ...unitScopeWhere(user, 'unitId'),
      /* Dia do serviço → data efetiva → criação: a mesma queda das consolidações,
         para a HE antiga sem dia trabalhado não sumir de todas as competências. */
      ...noPeriodo(limites.de, limites.ate),
    },
    select: {
      id: true, unitId: true, status: true, amount: true, hours: true, hourlyRate: true, transportValue: true,
      workDate: true, entryDate: true, createdAt: true, workStartTime: true, workEndTime: true,
      collaboratorId: true, collaboratorName: true, requestedById: true,
      approvedAt: true, paidAt: true, approvedBy: { select: { name: true } },
    },
    orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
  });
}

type HE = Awaited<ReturnType<typeof horasExtrasDoMes>>[number];

const paraQuadro = (r: HE): HoraExtraDoQuadro => ({
  id: r.id,
  unitId: r.unitId,
  collaboratorId: r.collaboratorId,
  colaborador: r.collaboratorName ?? 'Colaborador',
  dia: dataDe(r),
  inicio: r.workStartTime,
  fim: r.workEndTime,
  horas: r.hours,
  valorHora: r.hourlyRate != null ? Number(r.hourlyRate) : null,
  vt: Number(r.transportValue ?? 0),
  valor: Number(r.amount),
  status: r.status === 'PAID' ? 'PAID' : 'APPROVED',
  aprovadoPor: r.approvedBy?.name ?? null,
  aprovadoEm: r.approvedAt ?? r.paidAt ?? r.createdAt,
});

/**
 * O quadro da competência: unidade → colaborador (soma) → cada HE.
 *
 * Com a competência FECHADA, toda HE ainda "Aprovada" (não paga) é, por
 * construção, uma aprovada DEPOIS do fechamento — o fechamento marcou as
 * anteriores como pagas. Ela sai do total e do arquivo e vai para um bloco à
 * parte: um arquivo já enviado não pode mudar de conteúdo em silêncio; reabrir
 * e finalizar de novo é o caminho, e a tela diz isso.
 */
export async function getQuadroPagamentoExtra(user: SessionUser, competencia: string): Promise<QuadroDaCompetencia> {
  const mesTrabalhado = mesTrabalhadoDa(competencia);
  if (!mesTrabalhado) {
    return { competencia, tipo: 'EXTRA', grupos: [], totalGeral: 0, totalLancamentos: 0, fechada: false, fechadaPor: null, fechadaEm: null, unidadesSemLancamento: [] };
  }

  const [hes, unidades, entregas, fechamento] = await Promise.all([
    horasExtrasDoMes(user, mesTrabalhado, ['PENDING', 'APPROVED', 'PAID']),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.payoutDelivery.findMany({ where: { yearMonth: competencia, type: 'EXTRA', ...unitScopeWhere(user, 'unitId') } }),
    prisma.payoutClosure.findUnique({ where: { yearMonth_type: { yearMonth: competencia, type: 'EXTRA' } } }),
  ]);
  const fechada = Boolean(fechamento);

  const pendentes = hes.filter((h) => h.status === 'PENDING');
  const aprovadasOuPagas = hes.filter((h) => h.status !== 'PENDING');
  const aposFechamento = fechada ? aprovadasOuPagas.filter((h) => h.status === 'APPROVED') : [];
  const noQuadro = fechada ? aprovadasOuPagas.filter((h) => h.status === 'PAID') : aprovadasOuPagas;

  /* CPF e admissão saem do CADASTRO, como em Mobilidade. */
  const ids = [...new Set(noQuadro.map((h) => h.collaboratorId).filter((x): x is string => Boolean(x)))];
  const colaboradores = ids.length ? await prisma.collaborator.findMany({ where: { id: { in: ids } }, select: { id: true, cpf: true, hireDate: true } }) : [];
  const cadastro = new Map(colaboradores.map((c) => [c.id, c]));
  const entregaPor = new Map(entregas.map((e) => [e.unitId, e.deliveredAt]));
  const nomePor = new Map(unidades.map((u) => [u.id, u.name]));

  const porUnidade = new Map<string, LinhaDaUnidade[]>();
  for (const c of somarPorColaborador(noQuadro.map(paraQuadro))) {
    const cad = c.collaboratorId ? cadastro.get(c.collaboratorId) : undefined;
    const linha: LinhaDaUnidade = {
      id: c.chave,
      collaboratorId: c.collaboratorId ?? '',
      colaborador: c.colaborador,
      cpf: cad?.cpf ?? null,
      admissaoEm: cad?.hireDate ?? null,
      valor: c.valor,
      observacao: null,
      lancadoPor: 'Pagamentos',
      lancadoEm: c.ultimaAprovacaoEm ?? new Date(),
      horas: c.horas,
      status: c.status,
      horasExtras: c.horasExtras,
    };
    porUnidade.set(c.unitId, [...(porUnidade.get(c.unitId) ?? []), linha]);
  }

  const grupos: GrupoDeUnidade[] = [...porUnidade.entries()]
    .map(([unitId, linhas]) => ({
      unitId,
      unidade: nomePor.get(unitId) ?? '—',
      lancamentos: linhas,
      total: centavos(linhas.reduce((s, l) => s + l.valor, 0)),
      entregaEm: entregaPor.get(unitId) ?? null,
    }))
    .sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR'));

  return {
    competencia, tipo: 'EXTRA', grupos,
    totalGeral: centavos(grupos.reduce((s, g) => s + g.total, 0)),
    totalLancamentos: noQuadro.length,
    fechada,
    fechadaPor: fechamento?.closedByName ?? null,
    fechadaEm: fechamento?.closedAt ?? null,
    unidadesSemLancamento: unidades.filter((u) => !porUnidade.has(u.id)),
    extra: {
      mesTrabalhado,
      rotuloMesTrabalhado: rotuloDaCompetencia(mesTrabalhado),
      colaboradores: grupos.reduce((s, g) => s + g.lancamentos.length, 0),
      pendentes: { qtd: pendentes.length, valor: centavos(pendentes.reduce((s, h) => s + Number(h.amount), 0)) },
      aposFechamento: {
        qtd: aposFechamento.length,
        valor: centavos(aposFechamento.reduce((s, h) => s + Number(h.amount), 0)),
        linhas: aposFechamento.map(paraQuadro),
      },
    },
  };
}

/**
 * Finalizar a competência do Pagamento Extra = fechar E marcar as HE pagas.
 *
 * Só ADMIN/CEO/FINANCE: o fechamento é da rede inteira (não há fechamento por
 * unidade) e muda o status de pagamentos — o Supervisor, que fecha Mobilidade,
 * enxerga só as unidades dele e não paga. As HE viram PAGAS com `paidBy` = quem
 * fechou, cada uma com a sua linha na Auditoria, e cada solicitante recebe UM
 * aviso (não um por HE: seriam dezenas para o mesmo gerente).
 *
 * Reabrir (Admin, em `payouts-competencia.ts`) NÃO desfaz o pago: pago é fato
 * consumado no cartão; reabrir serve para incluir a HE aprovada atrasada e
 * finalizar de novo — e o segundo fechamento só marca o que ainda não estava.
 */
export async function fecharPagamentoExtra(user: SessionUser, competencia: string, ctx: Ctx = {}): Promise<ResultadoPayout> {
  if (!podeFecharPagamentoExtra(user.role)) return { ok: false, reason: 'FORBIDDEN', message: 'Só Admin, CEO ou Financeiro finalizam o Pagamento Extra (marca as horas extras como pagas).' };
  const mesTrabalhado = mesTrabalhadoDa(competencia);
  if (!mesTrabalhado) return { ok: false, reason: 'INVALID' };

  const aprovadas = await horasExtrasDoMes(user, mesTrabalhado, ['APPROVED']);
  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payoutClosure.upsert({
      where: { yearMonth_type: { yearMonth: competencia, type: 'EXTRA' } },
      create: { yearMonth: competencia, type: 'EXTRA', closedById: user.id, closedByName: user.name },
      update: {},
    });
    if (aprovadas.length) {
      await tx.paymentRequest.updateMany({
        where: { id: { in: aprovadas.map((a) => a.id) }, status: 'APPROVED' },
        data: { status: 'PAID', paidById: user.id, paidAt: agora },
      });
    }
  });

  await audit({ userId: user.id, action: 'PAYOUT_CLOSE', module: 'PEOPLE', entity: 'payout_closure', metadata: { competencia, tipo: 'EXTRA', pagas: aprovadas.length }, ...ctx });
  for (const a of aprovadas) {
    await audit({ userId: user.id, unitId: a.unitId, action: 'PAYMENT_PAID', module: 'PAYMENTS', entity: 'payment_request', entityId: a.id, metadata: { via: 'PAGAMENTO_EXTRA', competencia }, ...ctx });
  }

  const porSolicitante = new Map<string, number>();
  for (const a of aprovadas) if (a.requestedById) porSolicitante.set(a.requestedById, (porSolicitante.get(a.requestedById) ?? 0) + 1);
  for (const [quem, qtd] of porSolicitante) {
    await notifyUsers([quem], {
      title: 'Horas extras pagas',
      body: `${qtd} hora(s) extra(s) sua(s) entraram no Pagamento Extra de ${rotuloDaCompetencia(competencia)} e foram marcadas como pagas.`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
  return { ok: true, gravados: aprovadas.length };
}
