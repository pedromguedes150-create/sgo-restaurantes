/**
 * Escala de gerentes — a REDE (v1.170.0).
 *
 * Duas leituras para a diretoria, nenhuma gravação:
 *  - "Hoje na rede": quem está de folga ou férias HOJE, unidade por unidade,
 *    quem cobre e onde não há ninguém (Admin/CEO e Coordenação);
 *  - "Relatório da rede": folgas e férias do mês de TODOS os gerentes, com quem
 *    lançou, quem está sem folga cadastrada e as exclusões com motivo (só Admin).
 *
 * As contas moram em `manager-schedule-regras.ts` (puro); aqui só se busca, e
 * sempre pelo vínculo com a unidade — gerente de duas unidades aparece nas
 * duas, nunca numa lista "da rede" solta.
 */

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { parseWeekdays, daysOfMonth } from '@/lib/manager-schedule';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import {
  amanha, diasDentro, montarUnidadeHoje, proximasAusencias, resumirHoje,
  type AusenciaProxima, type GerenteHoje, type ResumoHoje, type UnidadeHoje,
} from '@/lib/manager-schedule-regras';
import type { SessionUser } from '@/lib/auth/session';

/** Gerentes de cada unidade com as ausências ATIVAS que tocam [de, ate]. */
async function gerentesDaRede(user: SessionUser, de: string, ate: string) {
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const unitIds = units.map((u) => u.id);
  const usuarios = unitIds.length === 0 ? [] : await prisma.user.findMany({
    where: { active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId: { in: unitIds } } } },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true,
      memberships: { where: { unitId: { in: unitIds } }, select: { unitId: true } },
      managerWorkSchedule: { select: { weekdays: true, startTime: true, endTime: true } },
      managerLeaves: {
        where: { deletedAt: null, startDate: { lte: ate }, endDate: { gte: de } },
        orderBy: { startDate: 'asc' },
        select: { id: true, kind: true, startDate: true, endDate: true, note: true, createdById: true, createdAt: true },
      },
    },
  });
  const autores = [...new Set(usuarios.flatMap((u) => u.managerLeaves.map((l) => l.createdById)).filter((x): x is string => Boolean(x)))];
  const nome = new Map<string, string>();
  if (autores.length > 0) {
    for (const a of await prisma.user.findMany({ where: { id: { in: autores } }, select: { id: true, name: true } })) nome.set(a.id, a.name);
  }
  return { units, usuarios, nomeDoAutor: nome };
}

export interface HojeNaRede {
  hoje: string;
  amanha: string;
  resumo: ResumoHoje;
  unidades: UnidadeHoje[];
  /** Quem estará fora nos próximos 7 dias (só lançamentos). */
  proximos: AusenciaProxima[];
}

export async function getHojeNaRede(user: SessionUser, hoje: string = hojeNaOperacao()): Promise<HojeNaRede> {
  const fim = (() => { let d = hoje; for (let i = 0; i < 7; i++) d = amanha(d); return d; })();
  const { units, usuarios, nomeDoAutor } = await gerentesDaRede(user, hoje, fim);

  const porUnidade = new Map<string, GerenteHoje[]>(units.map((u) => [u.id, []]));
  for (const u of usuarios) {
    const g: GerenteHoje = {
      userId: u.id,
      name: u.name,
      weekdays: u.managerWorkSchedule ? parseWeekdays(u.managerWorkSchedule.weekdays) : [],
      startTime: u.managerWorkSchedule?.startTime ?? null,
      endTime: u.managerWorkSchedule?.endTime ?? null,
      ausencias: u.managerLeaves.map((l) => ({
        kind: l.kind === 'FERIAS' ? 'FERIAS' : 'FOLGA', startDate: l.startDate, endDate: l.endDate, note: l.note,
        lancadoPor: l.createdById ? (l.createdById === u.id ? 'o próprio gerente' : nomeDoAutor.get(l.createdById) ?? null) : null,
      })),
    };
    for (const m of u.memberships) porUnidade.get(m.unitId)?.push(g);
  }

  const unidades = units.map((u) => montarUnidadeHoje(u.id, u.name, porUnidade.get(u.id) ?? [], hoje));
  /* Unidade com problema primeiro: é para isso que a diretoria abre a tela. */
  unidades.sort((a, b) => Number(b.semGerente) - Number(a.semGerente) || a.unitName.localeCompare(b.unitName, 'pt-BR'));
  const proximos = proximasAusencias(units.map((u) => ({ unitName: u.name, gerentes: porUnidade.get(u.id) ?? [] })), hoje, 7);

  return { hoje, amanha: amanha(hoje), resumo: resumirHoje(unidades), unidades, proximos };
}

/* ───────────── Relatório da rede (Admin) ───────────── */

export interface LancamentoDoRelatorio {
  kind: 'FOLGA' | 'FERIAS';
  startDate: string;
  endDate: string;
  diasNoMes: number;
  note: string | null;
  lancadoPor: string;
  lancadoEm: string;
}
export interface GerenteDoRelatorio {
  userId: string;
  name: string;
  temHorario: boolean;
  lancamentos: LancamentoDoRelatorio[];
  diasDeFolga: number;
  diasDeFerias: number;
  /** Nenhuma folga nem férias cadastrada no mês — é o que a meta desconta. */
  semFolga: boolean;
}
export interface UnidadeDoRelatorio { unitId: string; unitName: string; gerentes: GerenteDoRelatorio[] }
export interface ExclusaoDoRelatorio {
  unitName: string;
  managerName: string;
  kind: 'FOLGA' | 'FERIAS';
  startDate: string;
  endDate: string;
  motivo: string;
  apagadoPor: string;
  apagadoEm: string;
}
export interface RelatorioDaRede {
  year: number;
  month: number;
  hoje: string;
  unidades: UnidadeDoRelatorio[];
  exclusoes: ExclusaoDoRelatorio[];
  resumo: {
    unidades: number;
    gerentes: number;
    comFolga: number;
    semFolga: number;
    diasDeFolga: number;
    diasDeFerias: number;
    lancadosPeloGerente: number;
    lancadosPelaSupervisao: number;
    exclusoes: number;
  };
}

/** Só ADMIN/CEO: é a rede inteira, gerente por gerente, com motivo de exclusão. */
export async function getRelatorioDaRede(user: SessionUser, year: number, month: number): Promise<RelatorioDaRede | null> {
  if (!['ADMIN', 'CEO'].includes(user.role)) return null;
  const dias = daysOfMonth(year, month);
  const de = dias[0].iso;
  const ate = dias[dias.length - 1].iso;
  const { units, usuarios, nomeDoAutor } = await gerentesDaRede(user, de, ate);

  const porUnidade = new Map<string, GerenteDoRelatorio[]>(units.map((u) => [u.id, []]));
  const vistos = new Map<string, GerenteDoRelatorio>();
  let lancadosPeloGerente = 0;
  let lancadosPelaSupervisao = 0;
  for (const u of usuarios) {
    const lancamentos: LancamentoDoRelatorio[] = u.managerLeaves.map((l) => {
      if (l.createdById === u.id) lancadosPeloGerente++; else lancadosPelaSupervisao++;
      return {
        kind: l.kind === 'FERIAS' ? 'FERIAS' : 'FOLGA',
        startDate: l.startDate, endDate: l.endDate,
        diasNoMes: diasDentro(l.startDate, l.endDate, de, ate),
        note: l.note,
        lancadoPor: l.createdById ? (l.createdById === u.id ? 'o próprio gerente' : nomeDoAutor.get(l.createdById) ?? '—') : 'o próprio gerente',
        lancadoEm: l.createdAt.toISOString(),
      };
    });
    const g: GerenteDoRelatorio = {
      userId: u.id,
      name: u.name,
      temHorario: Boolean(u.managerWorkSchedule) && parseWeekdays(u.managerWorkSchedule?.weekdays).length > 0,
      lancamentos,
      diasDeFolga: lancamentos.filter((l) => l.kind === 'FOLGA').reduce((s, l) => s + l.diasNoMes, 0),
      diasDeFerias: lancamentos.filter((l) => l.kind === 'FERIAS').reduce((s, l) => s + l.diasNoMes, 0),
      semFolga: lancamentos.length === 0,
    };
    vistos.set(u.id, g);
    for (const m of u.memberships) porUnidade.get(m.unitId)?.push(g);
  }

  /* Exclusões do período: a linha ficou (exclusão lógica), com motivo. */
  const unitIds = units.map((u) => u.id);
  const apagados = unitIds.length === 0 ? [] : await prisma.managerLeave.findMany({
    where: { deletedAt: { not: null }, startDate: { lte: ate }, endDate: { gte: de }, user: { memberships: { some: { unitId: { in: unitIds } } } } },
    orderBy: { deletedAt: 'desc' },
    select: {
      kind: true, startDate: true, endDate: true, deleteReason: true, deletedAt: true, deletedById: true,
      user: { select: { name: true, memberships: { where: { unitId: { in: unitIds } }, select: { unit: { select: { name: true } } } } } },
    },
  });
  const quemApagou = [...new Set(apagados.map((a) => a.deletedById).filter((x): x is string => Boolean(x)))];
  const nomeDeQuemApagou = new Map<string, string>();
  if (quemApagou.length > 0) {
    for (const a of await prisma.user.findMany({ where: { id: { in: quemApagou } }, select: { id: true, name: true } })) nomeDeQuemApagou.set(a.id, a.name);
  }
  const exclusoes: ExclusaoDoRelatorio[] = apagados.map((a) => ({
    unitName: a.user.memberships.map((m) => m.unit.name).join(' / ') || '—',
    managerName: a.user.name,
    kind: a.kind === 'FERIAS' ? 'FERIAS' : 'FOLGA',
    startDate: a.startDate, endDate: a.endDate,
    motivo: a.deleteReason ?? '—',
    apagadoPor: a.deletedById ? nomeDeQuemApagou.get(a.deletedById) ?? '—' : '—',
    apagadoEm: a.deletedAt?.toISOString() ?? '',
  }));

  const gerentes = [...vistos.values()];
  return {
    year, month, hoje: hojeNaOperacao(),
    unidades: units.map((u) => ({ unitId: u.id, unitName: u.name, gerentes: porUnidade.get(u.id) ?? [] })),
    exclusoes,
    resumo: {
      unidades: units.length,
      gerentes: gerentes.length,
      comFolga: gerentes.filter((g) => !g.semFolga).length,
      semFolga: gerentes.filter((g) => g.semFolga).length,
      diasDeFolga: gerentes.reduce((s, g) => s + g.diasDeFolga, 0),
      diasDeFerias: gerentes.reduce((s, g) => s + g.diasDeFerias, 0),
      lancadosPeloGerente, lancadosPelaSupervisao,
      exclusoes: exclusoes.length,
    },
  };
}
