import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { competenciaValida, receita, ticketMedio, type Competencia } from './calculo';
import { lerPlanilhaDeCupons, resumoDosDescartes, type LeituraDaPlanilha } from './planilha';
import { unidadeParticipa } from './participacao';

/**
 * IMPORTAÇÃO mensal — ler, conferir, só então gravar.
 *
 * A leitura e a gravação são DUAS chamadas de propósito. A prévia existe para
 * alguém olhar os números antes de eles virarem o consolidado do mês, e uma
 * prévia que já gravou não é prévia. O arquivo é lido de novo na confirmação:
 * carregar o resultado da primeira leitura num campo escondido deixaria a
 * gravação acreditar em número vindo do navegador.
 */

export type MotivoDaImportacao =
  | 'COMPETENCIA' | 'UNIDADE' | 'SEM_ACESSO' | 'NAO_PARTICIPA'
  | 'ARQUIVO' | 'PLANILHA' | 'MES_TROCADO' | 'SEM_CUPOM'
  | 'DUPLICADO' | 'SEM_PERMISSAO_SUBSTITUIR';

export interface Previa {
  unitId: string;
  unitName: string;
  competencia: Competencia;
  fileName: string;
  coupons: number;
  grossSales: number;
  discounts: number;
  receita: number;
  ticket: number | null;
  descartados: LeituraDaPlanilha['descartados'];
  avisos: string[];
  rodape: string | null;
  /** Já existe lançamento nesta competência? A tela então oferece substituir. */
  jaExiste: boolean;
  existente?: { importedByName: string; importedAt: Date; fileName: string; coupons: number; replacedCount: number };
}

export type ResultadoDaLeitura =
  | { ok: true; previa: Previa }
  | { ok: false; reason: MotivoDaImportacao; erro: string };

interface Entrada {
  unitId: string;
  competencia: string;
  fileName: string;
  linhas: unknown[][];
}

/** Valida a porta (unidade, competência, participação) e lê a planilha. */
export async function lerParaPrevia(user: SessionUser, e: Entrada): Promise<ResultadoDaLeitura> {
  if (!competenciaValida(e.competencia)) {
    return { ok: false, reason: 'COMPETENCIA', erro: 'Competência inválida.' };
  }
  const unidade = await prisma.unit.findUnique({ where: { id: e.unitId }, select: { id: true, name: true } });
  if (!unidade) return { ok: false, reason: 'UNIDADE', erro: 'Unidade não encontrada.' };
  if (!canAccessUnit(user, unidade.id)) {
    return { ok: false, reason: 'SEM_ACESSO', erro: 'Você não tem acesso a esta unidade.' };
  }
  if (!(await unidadeParticipa(unidade.id, e.competencia))) {
    return {
      ok: false, reason: 'NAO_PARTICIPA',
      erro: `${unidade.name} não participa do Ticket Médio nesta competência. Habilite em Configurações → Unidades participantes antes de importar.`,
    };
  }

  const leitura = lerPlanilhaDeCupons(e.linhas);
  if (!leitura.ok) return { ok: false, reason: 'PLANILHA', erro: leitura.erro! };

  /* O ENGANO MAIS PROVÁVEL da rotina: importar o arquivo do mês passado na
     competência nova. O total sai plausível e ninguém percebe — por isso a
     recusa é dura, e não um aviso. A conferência é pela data dos próprios
     cupons, não pelo rodapé, que nem todo relatório traz. */
  if (leitura.competenciaDoArquivo && leitura.competenciaDoArquivo !== e.competencia) {
    return {
      ok: false, reason: 'MES_TROCADO',
      erro: `A planilha é de ${rotulo(leitura.competenciaDoArquivo)}, mas a competência escolhida foi ${rotulo(e.competencia)}. Confira o arquivo ou troque a competência.`,
    };
  }

  const existente = await prisma.ticketMediaEntry.findUnique({
    where: { unitId_competence: { unitId: unidade.id, competence: e.competencia } },
    select: { importedByName: true, importedAt: true, fileName: true, coupons: true, replacedCount: true },
  });

  const numeros = { coupons: leitura.coupons, grossSales: leitura.grossSales, discounts: leitura.discounts };
  return {
    ok: true,
    previa: {
      unitId: unidade.id, unitName: unidade.name,
      competencia: e.competencia, fileName: e.fileName,
      ...numeros,
      receita: receita(numeros),
      ticket: ticketMedio(numeros),
      descartados: leitura.descartados,
      avisos: leitura.avisos,
      rodape: leitura.rodape,
      jaExiste: Boolean(existente),
      existente: existente ?? undefined,
    },
  };
}

export type ResultadoDaGravacao =
  | { ok: true; substituiu: boolean; previa: Previa }
  | { ok: false; reason: MotivoDaImportacao; erro: string };

/**
 * Grava o lançamento do mês.
 *
 * `substituir` nunca é implícito: sem ele, competência já lançada devolve
 * DUPLICADO e a tela pergunta. Sobrescrever calado é como o número de um mês
 * fechado muda sem ninguém saber por quê.
 */
export async function gravarImportacao(
  user: SessionUser,
  e: Entrada & { substituir?: boolean; podeSubstituir: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDaGravacao> {
  const lido = await lerParaPrevia(user, e);
  if (!lido.ok) return lido;
  const p = lido.previa;

  if (p.jaExiste && !e.substituir) {
    return {
      ok: false, reason: 'DUPLICADO',
      erro: `Já existem dados de Ticket Médio para ${p.unitName} em ${rotulo(p.competencia)}.`,
    };
  }
  if (p.jaExiste && e.substituir && !e.podeSubstituir) {
    return {
      ok: false, reason: 'SEM_PERMISSAO_SUBSTITUIR',
      erro: 'Só quem administra o Ticket Médio pode substituir uma importação já feita.',
    };
  }

  const agora = new Date();
  const comum = {
    coupons: p.coupons,
    grossSales: p.grossSales,
    discounts: p.discounts,
    skipped: p.descartados.reduce((s, d) => s + d.quantidade, 0),
    skippedDetail: resumoDosDescartes(p.descartados),
    fileName: p.fileName,
  };

  if (p.jaExiste) {
    const antes = await prisma.ticketMediaEntry.findUnique({
      where: { unitId_competence: { unitId: p.unitId, competence: p.competencia } },
    });
    await prisma.ticketMediaEntry.update({
      where: { unitId_competence: { unitId: p.unitId, competence: p.competencia } },
      data: {
        ...comum,
        replacedAt: agora, replacedById: user.id, replacedByName: user.name,
        replacedCount: { increment: 1 },
      },
    });
    await audit({
      userId: user.id, unitId: p.unitId, action: 'TICKET_MEDIA_REPLACE', module: 'TICKET_MEDIA',
      entity: 'ticket_media_entry', entityId: `${p.unitId}:${p.competencia}`,
      metadata: {
        competencia: p.competencia, unidade: p.unitName, arquivo: p.fileName,
        antes: antes && { cupons: antes.coupons, venda: Number(antes.grossSales), desconto: Number(antes.discounts), arquivo: antes.fileName },
        depois: { cupons: p.coupons, venda: p.grossSales, desconto: p.discounts },
      },
      ...ctx,
    });
    return { ok: true, substituiu: true, previa: p };
  }

  await prisma.ticketMediaEntry.create({
    data: {
      unitId: p.unitId, competence: p.competencia, ...comum,
      importedById: user.id, importedByName: user.name,
    },
  });
  await audit({
    userId: user.id, unitId: p.unitId, action: 'TICKET_MEDIA_IMPORT', module: 'TICKET_MEDIA',
    entity: 'ticket_media_entry', entityId: `${p.unitId}:${p.competencia}`,
    metadata: {
      competencia: p.competencia, unidade: p.unitName, arquivo: p.fileName,
      cupons: p.coupons, venda: p.grossSales, desconto: p.discounts,
      receita: p.receita, ticket: p.ticket, descartados: comum.skippedDetail,
    },
    ...ctx,
  });
  return { ok: true, substituiu: false, previa: p };
}

function rotulo(c: string): string {
  const M = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  if (!competenciaValida(c)) return c;
  return `${M[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`;
}
