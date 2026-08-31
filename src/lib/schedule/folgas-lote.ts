import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { vigenciaNaData, DIAS_DA_SEMANA, type ModoDeFolga } from './vigencia';
import { cicloSemanal } from './templates';
import { salvarEscalaDoColaborador } from './employee';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Folgas de toda a unidade numa tela só.
 *
 * Por que existe: a configuração por colaborador (v1.60) resolve o problema
 * certo, mas uma pessoa de cada vez. Numa unidade com 20 colaboradores e uma
 * rede com 15 unidades, ninguém abre 300 formulários — e a escala fica como
 * está: **todo mundo folgando no mesmo dia**, porque o cadastro antigo usava a
 * mesma data de início de ciclo para todos.
 */

export interface LinhaDeFolga {
  collaboratorId: string;
  name: string;
  jobTitle: string | null;
  /** O que a pessoa TEM hoje — é isto que o botão "buscar definições" traz. */
  templateId: string | null;
  templateName: string | null;
  /** O ciclo fecha em 7 dias? Só aí existe dia fixo de folga. */
  semanal: boolean;
  weeklyOffDay: number | null;
  offMode: ModoDeFolga | null;
  /** Sem escala cadastrada — aparece na lista mesmo assim, para não sumir. */
  semEscala: boolean;
}

/**
 * A situação de cada colaborador da unidade, hoje.
 *
 * Traz TODOS, inclusive quem não tem escala: são justamente esses que somem da
 * grade, e escondê-los aqui repetiria o problema que esta tela veio resolver.
 */
export async function listarFolgasDaUnidade(
  user: SessionUser,
  unitId: string,
  referencia: Date = new Date(),
): Promise<{ ok: true; linhas: LinhaDeFolga[] } | { ok: false; reason: 'FORBIDDEN' }> {
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const [colabs, versoes] = await Promise.all([
    prisma.collaborator.findMany({
      where: { active: true, units: { some: { unitId } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, jobTitle: true },
    }),
    prisma.employeeSchedule.findMany({
      where: { unitId, active: true },
      orderBy: { startDate: 'asc' },
      include: { template: { select: { id: true, name: true, workDays: true, offDays: true } } },
    }),
  ]);

  const porColab = new Map<string, typeof versoes>();
  for (const v of versoes) {
    const lista = porColab.get(v.collaboratorId) ?? [];
    lista.push(v);
    porColab.set(v.collaboratorId, lista);
  }

  const linhas: LinhaDeFolga[] = colabs.map((c) => {
    const minhas = porColab.get(c.id) ?? [];
    const atual = minhas.length > 0 ? (vigenciaNaData(minhas, referencia) ?? minhas[minhas.length - 1]) : null;
    const t = atual?.template ?? null;
    return {
      collaboratorId: c.id,
      name: c.name,
      jobTitle: c.jobTitle,
      templateId: t?.id ?? null,
      templateName: t?.name ?? null,
      semanal: t ? cicloSemanal(t.workDays, t.offDays) : false,
      weeklyOffDay: atual?.weeklyOffDay ?? null,
      offMode: (atual?.offMode as ModoDeFolga | undefined) ?? null,
      semEscala: atual === null,
    };
  });

  return { ok: true, linhas };
}

export interface ItemDeFolga {
  collaboratorId: string;
  templateId: string;
  weeklyOffDay: number;
}

export interface ResultadoDoLote {
  salvos: number;
  /** Quem não pôde ser salvo, com o motivo em português. */
  erros: { colaborador: string; motivo: string }[];
  /** Quantos folgam em cada dia depois de salvar (0=domingo … 6=sábado). */
  porDia: number[];
}

/**
 * Grava a folga de várias pessoas de uma vez, todas com a mesma vigência.
 *
 * Reusa `salvarEscalaDoColaborador` em vez de escrever no banco direto: é lá
 * que mora a regra de fechar a vigência anterior na véspera. Duplicar a
 * gravação aqui criaria um segundo caminho que um dia discordaria do primeiro.
 */
export async function salvarFolgasEmLote(
  user: SessionUser,
  input: { unitId: string; startDate: string; itens: ItemDeFolga[] },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ ok: true; resultado: ResultadoDoLote } | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; message?: string }> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate ?? '')) {
    return { ok: false, reason: 'INVALID', message: 'Informe a partir de quando estas folgas passam a valer.' };
  }
  if (!Array.isArray(input.itens) || input.itens.length === 0) {
    return { ok: false, reason: 'INVALID', message: 'Nenhuma folga para salvar.' };
  }

  const nomes = new Map(
    (await prisma.collaborator.findMany({
      where: { id: { in: input.itens.map((i) => i.collaboratorId) } },
      select: { id: true, name: true },
    })).map((c) => [c.id, c.name]),
  );

  const res: ResultadoDoLote = { salvos: 0, erros: [], porDia: [0, 0, 0, 0, 0, 0, 0] };

  for (const item of input.itens) {
    const nome = nomes.get(item.collaboratorId) ?? item.collaboratorId;
    const r = await salvarEscalaDoColaborador(
      user,
      {
        collaboratorId: item.collaboratorId,
        unitId: input.unitId,
        templateId: item.templateId,
        startDate: input.startDate,
        weeklyOffDay: item.weeklyOffDay,
        offMode: 'FIXED_WEEKLY',
      },
      ctx,
    );
    if (r.ok) {
      res.salvos++;
      const d = ((Math.trunc(item.weeklyOffDay) % 7) + 7) % 7;
      res.porDia[d]++;
    } else {
      /* Um erro não derruba o lote: salvar 18 de 20 e dizer quais 2 faltaram é
         melhor do que recusar tudo e obrigar a começar de novo. */
      res.erros.push({ colaborador: nome, motivo: r.message ?? 'não foi possível salvar' });
    }
  }

  return { ok: true, resultado: res };
}

/** "3 na segunda · 2 na terça" — para ver se algum dia ficou descoberto. */
export function resumoPorDia(porDia: number[]): string {
  return porDia
    .map((n, i) => ({ n, dia: DIAS_DA_SEMANA[i] }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${x.dia.toLowerCase()}`)
    .join(' · ');
}
