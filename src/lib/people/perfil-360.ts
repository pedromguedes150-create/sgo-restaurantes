import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { FERIAS_QUE_CONTAM } from '@/lib/schedule';
import {
  datasDoEvento, faixaDeFerias, periodoEmFoco, periodosAquisitivos, tempoDeEmpresa,
  type FaixaDeFerias, type PeriodoAquisitivo,
} from '@/lib/people/periodo-aquisitivo';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PERFIL 360 DO COLABORADOR (v1.153.0) — tudo sobre a pessoa em um lugar.
 *
 * É COMPOSIÇÃO do que os módulos já gravam, sem tabela nova e sem regra nova
 * (pedido do Pedro: "não quero alterar nenhuma lógica que já está em
 * andamento"): cadastro e admissão vêm do RH (sync), hora extra de Pagamentos,
 * mobilidade/comissão de Pessoas, avaliação, atestados, treinamentos, escala,
 * mudanças de função e férias dos seus módulos. Cada bloco só é montado se o
 * perfil de quem pergunta pode abrir o módulo de origem (`pode`) — o perfil não
 * vira porta dos fundos para dado que a matriz fecha.
 */

export type Pode = (href: string) => boolean;

const hojeBR = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const isoDia = (d: Date) => d.toISOString().slice(0, 10);
const ymMenos = (ym: string, k: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 - k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** CPF formatado; perfis operacionais veem só o fim (LGPD: o mínimo necessário). */
export function cpfParaExibir(cpf: string | null, role: SessionUser['role']): string | null {
  const d = (cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return cpf || null;
  const cheio = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return ['ADMIN', 'CEO', 'SUPERVISOR', 'FINANCE'].includes(role) ? cheio : `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** O colaborador só abre se tiver vínculo com alguma unidade do alcance. */
async function colaboradorNoAlcance(user: SessionUser, id: string) {
  return prisma.collaborator.findFirst({
    where: { id, units: { some: unitScopeWhere(user, 'unitId') } },
    include: { units: { include: { unit: { select: { id: true, name: true } } } } },
  });
}

export interface ItemDoHistorico { data: string; tipo: string; titulo: string; detalhe?: string; href?: string }

export async function getPerfil360(user: SessionUser, id: string, pode: Pode, agora = new Date()) {
  const c = await colaboradorNoAlcance(user, id);
  if (!c) return null;
  const hoje = hojeBR(agora);
  const ymHoje = hoje.slice(0, 7);
  const ym12 = ymMenos(ymHoje, 11);
  const desde12 = new Date(`${ym12}-01T00:00:00Z`);
  const unitIds = c.units.map((u) => u.unitId);

  const veHE = pode('/modulos/hora-extra') || pode('/modulos/pagamentos');
  const vePayout = pode('/modulos/mobilidade');
  const veAvaliacao = pode('/modulos/pessoas/avaliacao');
  const veAtestado = pode('/modulos/atestados');
  const veTreino = pode('/modulos/treinamentos');
  const veMudanca = pode('/modulos/pessoas/mudancas');

  const [ferias, abonos, he, payouts, avaliacoes, observacoes, atestados, treinos, mudancas, escala, experiencia, desligamento, eventosRh] = await Promise.all([
    prisma.vacation.findMany({ where: { collaboratorId: id }, orderBy: { startDate: 'desc' }, select: { startDate: true, endDate: true, status: true, source: true } }),
    prisma.vacationAbono.findMany({ where: { collaboratorId: id }, orderBy: { periodoInicio: 'desc' }, select: { id: true, periodoInicio: true, dias: true, observacao: true, createdByName: true, createdById: true, createdAt: true } }),
    veHE ? prisma.paymentRequest.findMany({
      where: { collaboratorId: id, type: 'OVERTIME', OR: [{ workDate: { gte: desde12 } }, { workDate: null, createdAt: { gte: desde12 } }] },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, status: true, amount: true, hours: true, workDate: true, createdAt: true, reason: true, workStartTime: true, workEndTime: true },
    }) : Promise.resolve([]),
    vePayout ? prisma.collaboratorPayout.findMany({ where: { collaboratorId: id, yearMonth: { gte: ym12 } }, orderBy: { yearMonth: 'desc' }, select: { type: true, yearMonth: true, amount: true } }) : Promise.resolve([]),
    veAvaliacao ? prisma.collaboratorEvaluation.findMany({ where: { collaboratorId: id }, orderBy: { yearMonth: 'desc' }, take: 12, select: { yearMonth: true, punctuality: true, performance: true, teamwork: true, presentation: true, evaluatorName: true } }) : Promise.resolve([]),
    veAvaliacao ? prisma.collaboratorObservation.count({ where: { collaboratorId: id, createdAt: { gte: desde12 } } }) : Promise.resolve(0),
    veAtestado ? prisma.medicalCertificate.findMany({ where: { collaboratorId: id, startDate: { gte: `${ym12}-01` } }, orderBy: { startDate: 'desc' }, select: { startDate: true, endDate: true, days: true, type: true } }) : Promise.resolve([]),
    veTreino ? prisma.trainingRecord.findMany({ where: { collaboratorId: id }, orderBy: { dueDate: 'desc' }, take: 60, select: { status: true, dueDate: true, completedAt: true, moduleName: true, pop: { select: { title: true } } } }) : Promise.resolve([]),
    veMudanca ? prisma.roleChange.findMany({ where: { collaboratorId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { kind: true, fromValue: true, toValue: true, requestedByName: true, createdAt: true } }) : Promise.resolve([]),
    prisma.employeeSchedule.findFirst({ where: { collaboratorId: id, active: true }, orderBy: { startDate: 'desc' }, select: { scheduleType: true, startTime: true, endTime: true, startDate: true } }),
    prisma.probationReview.findUnique({ where: { collaboratorId: id }, select: { status: true } }),
    prisma.termination.findFirst({ where: { collaboratorId: id }, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true, noticeType: true } }),
    /* Eventos de período aquisitivo que o RH enviou pelo webhook, casados por CPF ou matrícula. */
    (c.cpf || c.externalId) ? prisma.rhInboundEvent.findMany({
      where: {
        event: { in: ['periodo_aquisitivo', 'exclusao_periodo'] },
        OR: [
          ...(c.cpf ? [
            { payload: { path: ['cpf'], equals: c.cpf } },
            { payload: { path: ['cpf'], equals: c.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') } },
          ] : []),
          ...(c.externalId ? [{ payload: { path: ['matricula'], equals: c.externalId } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' }, take: 10, select: { event: true, payload: true, createdAt: true },
    }).catch(() => []) : Promise.resolve([]),
  ]);

  /* ── férias / período aquisitivo ── */
  const gozos = ferias.filter((f) => FERIAS_QUE_CONTAM.includes(f.status)).map((f) => ({ inicio: isoDia(f.startDate), fim: isoDia(f.endDate) }));
  const periodos = periodosAquisitivos(c.hireDate, gozos, hoje, undefined, abonos);
  const foco = periodoEmFoco(periodos);
  const emGozo = gozos.find((g) => g.inicio <= hoje && g.fim >= hoje) ?? null;
  const programadas = ferias.filter((f) => isoDia(f.startDate) > hoje).map((f) => ({ inicio: isoDia(f.startDate), fim: isoDia(f.endDate), status: f.status }));

  /* ── hora extra (aprovada ou paga conta; pendente e rejeitada à parte) ── */
  const heValidas = he.filter((h) => h.status === 'APPROVED' || h.status === 'PAID');
  const horaExtra = veHE ? {
    horas: heValidas.reduce((s, h) => s + (h.hours ?? 0), 0),
    valor: heValidas.reduce((s, h) => s + Number(h.amount), 0),
    aprovadas: heValidas.length,
    pendentes: he.filter((h) => h.status === 'PENDING').length,
    ultimas: he.slice(0, 8).map((h) => ({ id: h.id, data: isoDia(h.workDate ?? h.createdAt), status: h.status, horas: h.hours ?? 0, valor: Number(h.amount), motivo: h.reason, periodo: h.workStartTime && h.workEndTime ? `${h.workStartTime}–${h.workEndTime}` : null })),
  } : null;

  /* ── mobilidade e comissão ── */
  const somaTipo = (tipo: string) => {
    const l = payouts.filter((p) => p.type === tipo);
    return l.length ? { total: l.reduce((s, p) => s + Number(p.amount), 0), registros: l.length, ultimo: { yearMonth: l[0].yearMonth, valor: Number(l[0].amount) } } : null;
  };

  /* ── avaliação: média dos 4 critérios (1–5) ── */
  const nota = (a: { punctuality: number; performance: number; teamwork: number; presentation: number }) => (a.punctuality + a.performance + a.teamwork + a.presentation) / 4;
  const avaliacao = veAvaliacao ? {
    ultima: avaliacoes[0] ? { yearMonth: avaliacoes[0].yearMonth, nota: nota(avaliacoes[0]), avaliador: avaliacoes[0].evaluatorName } : null,
    media12: avaliacoes.length ? avaliacoes.reduce((s, a) => s + nota(a), 0) / avaliacoes.length : null,
    serie: [...avaliacoes].reverse().map((a) => ({ yearMonth: a.yearMonth, nota: nota(a) })),
    observacoes,
  } : null;

  /* ── histórico (linha do tempo) ── */
  const historico: ItemDoHistorico[] = [];
  if (c.hireDate) historico.push({ data: c.hireDate, tipo: 'Admissão', titulo: 'Admissão', detalhe: c.jobTitle ?? undefined });
  for (const f of ferias) historico.push({ data: isoDia(f.startDate), tipo: 'Férias', titulo: `Férias ${isoDia(f.startDate).split('-').reverse().join('/')} a ${isoDia(f.endDate).split('-').reverse().join('/')}`, detalhe: f.source === 'RH_SYNC' ? 'aberta pelo sync do RH' : undefined });
  for (const h of he) historico.push({ data: isoDia(h.workDate ?? h.createdAt), tipo: 'Hora extra', titulo: `Hora extra ${h.hours ? `${h.hours.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h` : ''} · R$ ${Number(h.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, detalhe: [STATUS_HE[h.status], h.reason].filter(Boolean).join(' · ') });
  for (const p of payouts) historico.push({ data: `${p.yearMonth}-01`, tipo: p.type === 'MOBILITY' ? 'Mobilidade' : p.type === 'COMMISSION' ? 'Comissão' : 'Pagamento extra', titulo: `${p.type === 'MOBILITY' ? 'Mobilidade' : p.type === 'COMMISSION' ? 'Comissão' : 'Pagamento extra'} ${p.yearMonth.split('-').reverse().join('/')} · R$ ${Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` });
  for (const a of avaliacoes) historico.push({ data: `${a.yearMonth}-01`, tipo: 'Avaliação', titulo: `Avaliação ${a.yearMonth.split('-').reverse().join('/')} · nota ${nota(a).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`, detalhe: `por ${a.evaluatorName}` });
  for (const a of atestados) historico.push({ data: a.startDate, tipo: 'Atestado', titulo: `Atestado · ${a.days} dia(s)`, detalhe: `${a.startDate.split('-').reverse().join('/')} a ${a.endDate.split('-').reverse().join('/')}` });
  for (const m of mudancas) historico.push({ data: isoDia(m.createdAt), tipo: 'Mudança', titulo: `${m.kind === 'SECTOR' ? 'Setor' : 'Função'}: ${m.fromValue ?? '—'} → ${m.toValue}`, detalhe: `por ${m.requestedByName}` });
  for (const t of treinos.filter((x) => x.completedAt)) historico.push({ data: isoDia(t.completedAt!), tipo: 'Treinamento', titulo: `Treinamento concluído · ${t.pop.title}`, detalhe: t.moduleName });
  for (const a of abonos) historico.push({ data: isoDia(a.createdAt), tipo: 'Férias', titulo: `Vendeu ${a.dias} dia(s) de férias (abono)`, detalhe: `período iniciado em ${a.periodoInicio.split('-').reverse().join('/')} · por ${a.createdByName}` });
  if (desligamento) historico.push({ data: isoDia(desligamento.createdAt), tipo: 'Desligamento', titulo: `Desligamento solicitado (${desligamento.status === 'PENDING' ? 'pendente' : desligamento.status === 'APPROVED' ? 'aprovado' : 'recusado'})` });
  historico.sort((a, b) => b.data.localeCompare(a.data));

  return {
    colaborador: {
      id: c.id, nome: c.name, funcao: c.jobTitle, ativo: c.active, origem: c.source, matricula: c.externalId,
      cpf: cpfParaExibir(c.cpf, user.role), admissao: c.hireDate,
      unidades: c.units.map((u) => ({ id: u.unit.id, nome: u.unit.name })),
    },
    hoje,
    tempo: tempoDeEmpresa(c.hireDate, hoje),
    ferias: { periodos, foco, faixa: faixaDeFerias(foco, Boolean(c.hireDate)), emGozo, programadas, abonos: abonos.map((a) => ({ id: a.id, periodoInicio: a.periodoInicio, dias: a.dias, observacao: a.observacao, por: a.createdByName, em: isoDia(a.createdAt), createdById: a.createdById })), eventosRh: eventosRh.map((e) => ({ evento: e.event, recebidoEm: isoDia(e.createdAt), datas: datasDoEvento(e.payload) })) },
    horaExtra,
    mobilidade: vePayout ? somaTipo('MOBILITY') : null,
    comissao: vePayout ? somaTipo('COMMISSION') : null,
    avaliacao,
    atestados: veAtestado ? { registros: atestados.length, dias: atestados.reduce((s, a) => s + a.days, 0) } : null,
    treinamentos: veTreino ? {
      concluidos: treinos.filter((t) => t.status === 'DONE').length,
      pendentes: treinos.filter((t) => t.status === 'PENDING').length,
      atrasados: treinos.filter((t) => t.status === 'PENDING' && isoDia(t.dueDate) < hoje).length,
    } : null,
    escala: escala ? { tipo: escala.scheduleType, horario: escala.startTime && escala.endTime ? `${escala.startTime}–${escala.endTime}` : null, desde: isoDia(escala.startDate) } : null,
    experiencia: c.hireDate && tempoDeEmpresa(c.hireDate, hoje) && (tempoDeEmpresa(c.hireDate, hoje)!.anos === 0 && tempoDeEmpresa(c.hireDate, hoje)!.meses < 3)
      ? { status: experiencia?.status ?? 'PENDING' } : null,
    desligamento: desligamento ? { status: desligamento.status, desde: isoDia(desligamento.createdAt) } : null,
    historico,
    podeVer: { horaExtra: veHE, mobilidade: vePayout, avaliacao: veAvaliacao, atestados: veAtestado, treinamentos: veTreino, mudancas: veMudanca },
    unitIds,
  };
}

export const STATUS_HE: Record<string, string> = { PENDING: 'Pendente', APPROVED: 'Aprovada', PAID: 'Paga', REJECTED: 'Rejeitada' };

/* ───────────────────────── CONTROLE DE FÉRIAS (rede) ───────────────────────── */

export interface LinhaDoControle {
  id: string;
  nome: string;
  funcao: string | null;
  unidade: string;
  unitId: string;
  admissao: string | null;
  faixa: FaixaDeFerias;
  foco: PeriodoAquisitivo | null;
  vencidos: number;
  emGozo: boolean;
  programada: { inicio: string; fim: string } | null;
  /** Períodos em que ainda dá para vender dias (com saldo, sem abono, julgados pelo SGO). */
  vendaveis: { inicio: string; fim: string; saldo: number }[];
}

/**
 * Todos os colaboradores ATIVOS do alcance com a situação do período aquisitivo.
 * `unitId` filtra (AND com o escopo — id fora do alcance volta vazio).
 */
export async function getControleDeFerias(user: SessionUser, unitId?: string | null, agora = new Date()) {
  const hoje = hojeBR(agora);
  const unidades = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const alvo = unitId ? unidades.filter((u) => u.id === unitId) : unidades;
  const ids = alvo.map((u) => u.id);
  const nomeUnidade = new Map(unidades.map((u) => [u.id, u.name]));

  const colabs = ids.length ? await prisma.collaborator.findMany({
    where: { active: true, units: { some: { unitId: { in: ids } } } },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, jobTitle: true, hireDate: true,
      units: { where: { unitId: { in: ids } }, select: { unitId: true }, take: 1 },
      vacations: { where: { status: { in: FERIAS_QUE_CONTAM } }, select: { startDate: true, endDate: true } },
      vacationAbonos: { select: { periodoInicio: true, dias: true } },
    },
  }) : [];

  const linhas: LinhaDoControle[] = colabs.map((c) => {
    const gozos = c.vacations.map((v) => ({ inicio: isoDia(v.startDate), fim: isoDia(v.endDate) }));
    const periodos = periodosAquisitivos(c.hireDate, gozos, hoje, undefined, c.vacationAbonos);
    const foco = periodoEmFoco(periodos);
    const futura = gozos.filter((g) => g.inicio > hoje).sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ?? null;
    const uId = c.units[0]?.unitId ?? '';
    return {
      id: c.id, nome: c.name, funcao: c.jobTitle, unitId: uId, unidade: nomeUnidade.get(uId) ?? '', admissao: c.hireDate,
      faixa: faixaDeFerias(foco, Boolean(c.hireDate)), foco,
      vencidos: periodos.filter((p) => p.situacao === 'VENCIDO').length,
      emGozo: gozos.some((g) => g.inicio <= hoje && g.fim >= hoje),
      programada: futura,
      vendaveis: periodos.filter((p) => p.situacao !== 'ANTERIOR_AO_SGO' && p.situacao !== 'QUITADO' && p.saldo > 0 && p.diasVendidos === 0).map((p) => ({ inicio: p.inicio, fim: p.fim, saldo: p.saldo })),
    };
  });

  const conta = (f: FaixaDeFerias) => linhas.filter((l) => l.faixa === f).length;
  const porUnidade = alvo.map((u) => {
    const l = linhas.filter((x) => x.unitId === u.id);
    return { unitId: u.id, nome: u.name, ativos: l.length, vencidas: l.filter((x) => x.faixa === 'VENCIDA').length, ate30: l.filter((x) => x.faixa === 'ATE_30').length, ate90: l.filter((x) => x.faixa === 'ATE_60' || x.faixa === 'ATE_90').length, emGozo: l.filter((x) => x.emGozo).length, semAdmissao: l.filter((x) => x.faixa === 'SEM_ADMISSAO').length };
  }).filter((u) => u.ativos > 0);

  return {
    hoje, unidades, linhas, porUnidade,
    resumo: {
      ativos: linhas.length,
      vencidas: conta('VENCIDA'), ate30: conta('ATE_30'), ate60: conta('ATE_60'), ate90: conta('ATE_90'),
      emDia: conta('EM_DIA'), emAquisicao: conta('EM_AQUISICAO'), semAdmissao: conta('SEM_ADMISSAO'),
      emGozo: linhas.filter((l) => l.emGozo).length,
      programadas: linhas.filter((l) => l.programada).length,
    },
  };
}
