import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getActiveSequence } from '@/lib/commands/active';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

export type SubmitCountResult =
  | { ok: true; absent: number[]; newDivergences: number; rejected: number[]; /** Marcadas presentes que voltaram à sequência: em apuração e (v1.208.0) também as baixadas. */ recovered: number[]; /** Sempre vazio desde a v1.208.0 (sessões antigas congelaram este campo). */ aguardandoValidacao: number[]; /** v1.208.0: das recuperadas, as que estavam BAIXADAS. */ baixasRecuperadas: number[]; /** v1.193.1: das ausentes, as que JÁ estavam em apuração antes desta contagem. */ jaEmApuracao: number[] }
  | { ok: false; reason: 'FORBIDDEN' | 'NO_CONFIG' | 'OBSERVATION_REQUIRED' | 'INVALID' | 'CONFLITO_COM_SESSAO'; detalhe?: string };

/**
 * Registra a contagem diária de comandas (Módulo 3).
 * O gerente informa apenas as AUSENTES (ou "todas presentes"). Cada ausente vira
 * uma divergência (se ainda não houver uma aberta) + alerta ao Supervisor.
 * Observação é obrigatória quando há ausentes.
 */
export async function submitCount(
  user: SessionUser,
  input: {
    unitId: string;
    operationalDate?: string;
    allPresent: boolean;
    absentNumbers?: number[];
    /** Marcadas na grade como CONFERIDA. Quando vem, o servidor calcula os
     *  ausentes (é a fonte de verdade) e guarda o estado para a grade reabrir. */
    presentNumbers?: number[];
    /** Marcadas como EM USO (com cliente). Contam como PRESENTES. */
    inUseNumbers?: number[];
    /**
     * Números que ESTA contagem se propôs a conferir. Ausente = contagem
     * completa (todas as ativas).
     *
     * Existe por causa da rotina real: na madrugada o caixa confere só uma faixa
     * (ex.: 1–300) e a contagem completa acontece uma vez por semana. Sem o
     * escopo, as comandas que ninguém contou naquela noite virariam faltantes,
     * abririam divergência e alertariam o supervisor — todas as noites.
     */
    scopeNumbers?: number[];
    observation?: string;
    /**
     * v1.200.0 — a sessão de conferência que está gravando esta contagem. SÓ a
     * sessão a informa. Sem ela (grade antiga, atalho "Todas presentes", leitor
     * antigo) a contagem NÃO pode sobrescrever o resultado de uma sessão
     * concluída nem atropelar uma sessão em andamento do mesmo dia (B6).
     */
    sessionId?: string;
  },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SubmitCountResult> {
  try {
    assertUnitAccess(user, input.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const seq = await getActiveSequence(unit.id);
  if (!seq.config) return { ok: false, reason: 'NO_CONFIG' };

  // Data operacional: se vier do cliente, valida formato e não permite futuro
  const today = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  let operationalDate = today;
  if (input.operationalDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate) || input.operationalDate > today) {
      return { ok: false, reason: 'INVALID' };
    }
    operationalDate = input.operationalDate;
  }

  /* B6 (v1.200.0): quem NÃO é a sessão não sobrescreve o que a sessão gravou. */
  if (!input.sessionId) {
    const doDia = await prisma.commandCount.findUnique({ where: { unitId_operationalDate: { unitId: unit.id, operationalDate } }, select: { sessionId: true } });
    if (doDia?.sessionId) {
      return { ok: false, reason: 'CONFLITO_COM_SESSAO', detalhe: 'A contagem deste dia veio de uma conferência concluída e não pode ser sobrescrita por aqui. Para conferir de novo, inicie uma nova conferência.' };
    }
    const emAndamento = await prisma.commandCountSession.findFirst({ where: { unitId: unit.id, operationalDate, status: 'EM_ANDAMENTO' }, select: { id: true } });
    if (emAndamento) {
      return { ok: false, reason: 'CONFLITO_COM_SESSAO', detalhe: 'Há uma conferência em andamento nesta unidade. Termine ou cancele essa conferência antes de registrar a contagem por outro caminho.' };
    }
  }

  const inteiros = (v: number[] | undefined) => Array.from(new Set((v ?? []).filter((n) => Number.isInteger(n))));
  /* v1.193.0: presente/em uso aceitam a SEQUÊNCIA INTEIRA (`all`), inclusive
     baixadas — é assim que uma comanda dada como perdida volta. Só o JULGAMENTO
     (ausente → divergência) continua sobre `active`. */
  const present = inteiros(input.presentNumbers).filter((n) => seq.all.has(n));
  const inUse = inteiros(input.inUseNumbers).filter((n) => seq.all.has(n));

  /* ESCOPO: o que esta contagem se propôs a conferir. Fora dele, nada é julgado
     — nem vira faltante, nem vira divergência. */
  const escopoPedido = input.scopeNumbers === undefined ? null : inteiros(input.scopeNumbers).filter((n) => seq.all.has(n));
  /* C10 (v1.200.0): escopo PEDIDO e vazio é erro — antes caía em silêncio na
     sequência inteira, e quem achava que conferia a faixa conferia (e julgava) tudo. */
  if (escopoPedido !== null && escopoPedido.length === 0) {
    return { ok: false, reason: 'INVALID', detalhe: 'O escopo da conferência está vazio: informe a faixa a conferir ou confira a sequência completa.' };
  }
  const escopo = escopoPedido && escopoPedido.length > 0 ? new Set(escopoPedido) : seq.active;
  const parcial = escopo !== seq.active && escopo.size < seq.active.size;

  /* AUSENTES SÃO CALCULADOS AQUI quando a grade manda o que está marcado.
     Antes a tela mandava a lista de ausentes que ela mesma calculava como
     "ativas − conferidas", esquecendo as marcadas EM USO — e a tela dizia, na
     própria legenda, que "em uso" CONTA COMO PRESENTE. Resultado: comanda azul
     virava faltante, abria divergência e alertava o supervisor, contrariando o
     que o gerente via na tela. Com o cálculo no servidor existe uma definição
     só: ausente é o que não está nem conferido nem em uso. */
  const marcouGrade = input.presentNumbers !== undefined || input.inUseNumbers !== undefined;
  const requested = input.allPresent
    ? []
    : marcouGrade
      ? [...escopo].filter((n) => !present.includes(n) && !inUse.includes(n))
      : inteiros(input.absentNumbers).filter((n) => escopo.has(n));
  const absent = requested.filter((n) => seq.active.has(n));
  const rejected = requested.filter((n) => !seq.active.has(n));

  /* v1.193.1: a observação é exigida só para ausência NOVA. Com 125 comandas já
     em apuração, toda conferência pedia "o que houve?" para algo que já foi
     explicado na vez em que sumiu — e a mesma lista ia ao supervisor de novo. */
  const abertasAntes = absent.length === 0 ? [] : await prisma.commandDivergence.findMany({
    where: { unitId: unit.id, number: { in: absent }, status: { in: ['OPEN', 'INVESTIGATING'] } },
    select: { number: true },
  });
  const jaEmApuracao = [...new Set(abertasAntes.map((d) => d.number))].sort((a, b) => a - b);
  const novasAusentes = absent.filter((n) => !jaEmApuracao.includes(n));
  if (!input.allPresent && novasAusentes.length > 0 && !input.observation?.trim()) {
    return { ok: false, reason: 'OBSERVATION_REQUIRED' };
  }

  // registra/atualiza a contagem do dia
  /* Guarda o estado da grade: é o que permite reabrir para corrigir sem
     remarcar tudo. "Todas presentes" grava a sequência ativa inteira. */
  /* "Todas presentes" numa contagem parcial vale só para o escopo dela. */
  const presentSalvo = input.allPresent ? [...escopo] : present;
  await prisma.commandCount.upsert({
    where: { unitId_operationalDate: { unitId: unit.id, operationalDate } },
    create: {
      unitId: unit.id, operationalDate, allPresent: input.allPresent, absentCount: absent.length, createdById: user.id,
      presentNumbers: presentSalvo as unknown as Prisma.InputJsonValue,
      inUseNumbers: inUse as unknown as Prisma.InputJsonValue,
      scopeNumbers: parcial ? ([...escopo] as unknown as Prisma.InputJsonValue) : undefined,
      sessionId: input.sessionId ?? null,
    },
    update: {
      sessionId: input.sessionId ?? null,
      allPresent: input.allPresent, absentCount: absent.length, createdById: user.id,
      presentNumbers: presentSalvo as unknown as Prisma.InputJsonValue,
      inUseNumbers: inUse as unknown as Prisma.InputJsonValue,
      scopeNumbers: parcial ? ([...escopo] as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });

  /* RECUPERADAS (v1.193.0): o que foi marcado presente/em uso e estava em
     apuração fecha a divergência como RECUPERADA; o que estava BAIXADO ganha uma
     divergência nova já encerrada como RECUPERADA (a da baixa fica como história)
     — e `getActiveSequence` passa a devolver o número na ativa. */
  const vistas = new Set<number>([...present, ...inUse, ...(input.allPresent ? [...escopo] : [])]);
  const agora = new Date();
  /* v1.208.0: TODA divergência aberta do número visto fecha como RECUPERADA —
     inclusive a que esperava validação do Supervisor (regra da v1.200.0, desfeita). */
  const abertasVistas = await prisma.commandDivergence.findMany({
    where: { unitId: unit.id, number: { in: [...vistas] }, status: { in: ['OPEN', 'INVESTIGATING'] } },
    select: { id: true, number: true },
  });
  if (abertasVistas.length > 0) {
    await prisma.commandDivergence.updateMany({
      where: { id: { in: abertasVistas.map((d) => d.id) } },
      data: { status: 'CLOSED', outcome: 'RECOVERED', resolvedById: user.id, resolvedAt: agora },
    });
  }
  /* v1.208.0 — BAIXADA ENCONTRADA VOLTA NA HORA (decisão do Daniel, 16/11/2026).
     Relato: a gerente leu comandas baixadas que estavam no escritório e elas
     seguiam "bloqueadas" (cinza) dia após dia, à espera de uma validação que
     ninguém fazia. Agora, vista na conferência, a comanda volta à sequência:
     quem já tinha divergência aberta fechou acima; quem não tinha ganha uma
     divergência já encerrada como RECUPERADA (a da baixa fica como história, e
     `getActiveSequence` lê o ÚLTIMO desfecho). O Supervisor é avisado com os
     números e, se discordar, baixa de novo. */
  const comAberta = new Set(abertasVistas.map((d) => d.number));
  const baixasRecuperadas = [...vistas].filter((n) => seq.lost.has(n)).sort((a, b) => a - b);
  const semAberta = baixasRecuperadas.filter((n) => !comAberta.has(n));
  if (semAberta.length > 0) {
    await prisma.commandDivergence.createMany({
      data: semAberta.map((number) => ({
        unitId: unit.id, number, status: 'CLOSED' as const, outcome: 'RECOVERED' as const,
        observation: `Estava baixada e foi encontrada na conferência de ${operationalDate} — voltou à sequência.`,
        createdById: user.id, resolvedById: user.id, resolvedAt: agora,
      })),
    });
  }
  /** Mantido no retorno por compatibilidade (sessões antigas congelaram este campo); desde a v1.208.0 é sempre vazio. */
  const aguardandoValidacao: number[] = [];
  const recovered = [...new Set([...abertasVistas.map((d) => d.number), ...baixasRecuperadas])].sort((a, b) => a - b);

  // cria divergências para as ausentes NOVAS, de uma vez (eram centenas de idas ao banco em fila)
  let newDivergences = 0;
  if (novasAusentes.length > 0) {
    const r = await prisma.commandDivergence.createMany({
      data: novasAusentes.map((number) => ({ unitId: unit.id, number, observation: input.observation?.trim() || null, createdById: user.id })),
    });
    newDivergences = r.count;
  }

  // conclui a tarefa "Contagem de Comandas" do dia (idempotente)
  await prisma.taskInstance.updateMany({
    where: { unitId: unit.id, operationalDate, status: 'PENDING', template: { module: 'COMMANDS' } },
    data: { status: 'DONE', completedById: user.id, completedAt: new Date() },
  });

  await audit({
    userId: user.id,
    unitId: unit.id,
    action: 'COMMAND_COUNT',
    module: 'COMMANDS',
    metadata: { operationalDate, allPresent: input.allPresent, absent: absent.length, newDivergences, recovered, baixasRecuperadas, sessionId: input.sessionId ?? null },
    ...ctx,
  });
  if (baixasRecuperadas.length > 0) {
    await audit({ userId: user.id, unitId: unit.id, action: 'COMMAND_DIV_BAIXA_ENCONTRADA', module: 'COMMANDS', metadata: { numbers: baixasRecuperadas, operationalDate, voltouSozinha: true }, ...ctx });
    await notifyUnitRole(unit.id, 'SUPERVISOR', {
      title: 'Comanda baixada foi encontrada e voltou à sequência',
      body: `${unit.name}: comanda(s) ${baixasRecuperadas.join(', ')} estavam baixadas definitivamente e apareceram na conferência de ${operationalDate} (${user.name}). Já voltaram à sequência; se alguma não deveria, baixe de novo em Comandas.`,
      link: '/modulos/comandas',
      module: 'COMMANDS',
      nivel: 'IMPORTANTE',
    });
  }
  const recuperadasComuns = recovered.filter((n) => !baixasRecuperadas.includes(n));
  if (recuperadasComuns.length > 0) {
    await audit({
      userId: user.id, unitId: unit.id, action: 'COMMAND_DIV_RECOVERED', module: 'COMMANDS',
      metadata: { numbers: recuperadasComuns, origem: 'CONTAGEM', operationalDate }, ...ctx,
    });
    await notifyUnitRole(unit.id, 'SUPERVISOR', {
      title: 'Comandas recuperadas',
      body: `${unit.name}: comanda(s) ${recuperadasComuns.join(', ')} voltaram a aparecer na conferência de ${operationalDate} (${user.name}) e saíram da apuração.`,
      link: '/modulos/comandas',
      module: 'COMMANDS',
    });
  }
  if (newDivergences > 0) {
    await audit({
      userId: user.id,
      unitId: unit.id,
      action: 'COMMAND_DIVERGENCE_ALERT',
      module: 'COMMANDS',
      metadata: { numbers: novasAusentes, jaEmApuracao: jaEmApuracao.length, notify: ['SUPERVISOR'] },
      ...ctx,
    });
    // Alerta imediato ao Supervisor da unidade (spec Módulo 3) — só as NOVAS; as já em apuração ele já sabe
    await notifyUnitRole(unit.id, 'SUPERVISOR', {
      title: 'Divergência de comandas',
      body: `${unit.name}: comanda(s) ausente(s) ${novasAusentes.join(', ')} — registrado por ${user.name} (${operationalDate}).${jaEmApuracao.length ? ` Outras ${jaEmApuracao.length} seguem em apuração.` : ''}`,
      link: '/modulos/comandas',
      module: 'COMMANDS',
    });
  }

  return { ok: true, absent, newDivergences, rejected, recovered, aguardandoValidacao, baixasRecuperadas, jaEmApuracao };
}
