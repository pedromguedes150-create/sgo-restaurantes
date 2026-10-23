import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { normalizarCargo } from '@/lib/people/avaliacao-calculo';
import {
  aplicarAjustes, apurar, competenciaDePagamento, funcaoForaDaComissao, lerPlanilhaDeVendedores, mesDeApuracao, mesValido, resolverVinculoPorNome, rotuloDoMes,
  type Ajuste, type Apuracao, type LinhaDaApuracao, type Vinculo,
} from './calculo';
import { chavesDaCozinha, getPercentuais } from './config';

/**
 * APURAÇÃO DA COMISSÃO (v1.175.0) — em duas etapas, como o Ticket Médio: a
 * PRÉVIA lê a planilha e devolve a conta sem gravar; a CONFIRMAÇÃO relê o
 * arquivo (nunca aceita totais vindos do navegador), aplica os ajustes e os
 * vínculos informados pelo conferente e grava a apuração + um lançamento de
 * Comissão por pessoa na competência de pagamento (venda + 2).
 *
 * "Só funcionário cadastrado na unidade": o vendedor da planilha é casado com
 * um colaborador ATIVO do RH com vínculo nesta unidade — pelo vínculo lembrado
 * (`CommissionSellerLink`), pela escolha manual na prévia, ou pelo nome exato
 * (a mesma régua do vínculo da Hora extra). Quem não casa fica como "não
 * cadastrado", sem comissão, com sugestões para vincular. A cozinha segue a
 * mesma porta: colaboradores ativos da unidade cuja função foi marcada.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export const PODE_APURAR = new Set(['ADMIN', 'SUPERVISOR', 'CEO']);

export type MotivoDaApuracao = 'FORBIDDEN' | 'UNIDADE' | 'SEM_ACESSO' | 'MES' | 'PLANILHA' | 'AJUSTE' | 'VINCULO' | 'DUPLICADO' | 'FECHADA';

export interface Entrada {
  unitId: string;
  mesVenda: string;
  linhas: unknown[][];
  fileName: string;
  ajustes?: Record<string, Ajuste>;
  /** bruto da planilha → id do colaborador escolhido à mão na prévia. */
  vinculos?: Record<string, string>;
  substituir?: boolean;
}

export interface Previa {
  unitId: string; unitName: string;
  mesVenda: string; mesApuracao: string; competencia: string;
  rotulos: { venda: string; apuracao: string; pagamento: string };
  fileName: string; unidadeDeclarada: string | null;
  totalVendas: number; itens: number;
  pctVendedor: number; pctCozinha: number;
  linhas: LinhaDaApuracao[];
  totais: Apuracao['totais'];
  avisos: string[];
  /** Sem função marcada em Configurações → Comissão: a parte da cozinha não tem para quem ir. */
  cozinhaSemFuncao: boolean;
  jaExiste: boolean;
  existente: { importedByName: string; importedAt: string; totalAmount: number; replacedCount: number } | null;
  /** A competência de pagamento já foi fechada: nada pode ser gravado nela. */
  fechada: boolean;
  erros: string[];
}

export type ResultadoDaPrevia = { ok: true; previa: Previa } | { ok: false; reason: MotivoDaApuracao; erro: string };

function dec(n: unknown): number { return Number(n ?? 0); }

export async function montarPrevia(user: SessionUser, e: Entrada): Promise<ResultadoDaPrevia> {
  if (!PODE_APURAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN', erro: 'Só Supervisão e Administração apuram a comissão.' };
  if (!mesValido(e.mesVenda)) return { ok: false, reason: 'MES', erro: 'Informe o mês das vendas (AAAA-MM).' };
  const unidade = await prisma.unit.findUnique({ where: { id: e.unitId }, select: { id: true, name: true } });
  if (!unidade) return { ok: false, reason: 'UNIDADE', erro: 'Unidade não encontrada.' };
  if (!canAccessUnit(user, unidade.id)) return { ok: false, reason: 'SEM_ACESSO', erro: 'Você não tem acesso a esta unidade.' };

  const leitura = lerPlanilhaDeVendedores(e.linhas);
  if (!leitura.ok) return { ok: false, reason: 'PLANILHA', erro: leitura.erro ?? 'Planilha inválida.' };

  const competencia = competenciaDePagamento(e.mesVenda);
  const [pcts, chavesCozinha, colaboradores, links, existente, fechamento, ignoradas] = await Promise.all([
    getPercentuais(),
    chavesDaCozinha(),
    prisma.collaborator.findMany({
      where: { active: true, units: { some: { unitId: unidade.id } } },
      select: { id: true, name: true, jobTitle: true },
      orderBy: { name: 'asc' },
    }),
    prisma.commissionSellerLink.findMany({ where: { unitId: unidade.id } }),
    prisma.commissionImport.findUnique({ where: { unitId_salesMonth: { unitId: unidade.id, salesMonth: e.mesVenda } } }),
    prisma.payoutClosure.findUnique({ where: { yearMonth_type: { yearMonth: competencia, type: 'COMMISSION' } } }),
    prisma.commissionLinkDismissal.findMany({ where: { unitId: unidade.id }, select: { sellerCode: true, collaboratorId: true } }),
  ]);
  /* "Ignorar" de meses anteriores: aquele vendedor NÃO é aquele colaborador — a sugestão não volta. */
  const ignoradasPorCodigo = new Map<string, Set<string>>();
  for (const d of ignoradas) { const set = ignoradasPorCodigo.get(d.sellerCode) ?? new Set<string>(); set.add(d.collaboratorId); ignoradasPorCodigo.set(d.sellerCode, set); }

  const porId = new Map(colaboradores.map((c) => [c.id, c]));
  const linkPorCodigo = new Map(links.map((l) => [l.sellerCode, l.collaboratorId]));
  const vinculos = new Map<string, Vinculo>();
  const foraPorFuncao = new Map<string, Vinculo>();
  const sugestoes = new Map<string, Vinculo[]>();
  const erros: string[] = [];
  /* Gerente/Encarregado nunca recebe — e nem é oferecido como candidato de vínculo. */
  const candidatos = colaboradores.filter((c) => !funcaoForaDaComissao(c.jobTitle)).map((c) => ({ id: c.id, name: c.name }));
  const casar = (bruto: string, c: { id: string; name: string; jobTitle: string | null }) => {
    if (funcaoForaDaComissao(c.jobTitle)) foraPorFuncao.set(bruto, { collaboratorId: c.id, name: c.name });
    else vinculos.set(bruto, { collaboratorId: c.id, name: c.name });
  };

  for (const v of leitura.vendedores) {
    /* 1) escolha manual na prévia — só colaborador DESTA unidade */
    const manual = e.vinculos?.[v.bruto];
    if (manual) {
      const c = porId.get(manual);
      if (!c) { erros.push(`${v.nome}: o colaborador escolhido não é funcionário ativo desta unidade.`); }
      else { casar(v.bruto, c); continue; }
    }
    /* 2) vínculo lembrado de uma apuração anterior (ainda precisa estar ativo na unidade) */
    const lembrado = v.codigo ? linkPorCodigo.get(v.codigo) : undefined;
    if (lembrado && porId.has(lembrado)) { casar(v.bruto, porId.get(lembrado)!); continue; }
    /* 3) pelo nome: idêntico OU contido em UM só colaborador da unidade (o Teknisa grava o nome curto;
          gerente/encarregado incluído aqui — casa e entra como "fora"). Dois candidatos = para a mão. */
    const porNome = resolverVinculoPorNome(v.nome, colaboradores.map((c) => ({ id: c.id, name: c.name })));
    if (porNome.escolhido) { casar(v.bruto, porId.get(porNome.escolhido.id)!); continue; }
    /* 4) sem casamento: SUGESTÕES com o percentual de confiança (Souza × Sousa…) para alguém confirmar */
    const r = resolverVinculoPorNome(v.nome, candidatos, v.codigo ? ignoradasPorCodigo.get(v.codigo) : undefined);
    sugestoes.set(v.bruto, r.sugestoes.map((c) => ({ collaboratorId: c.id, name: c.name, confianca: c.confianca })));
  }

  const cozinha: Vinculo[] = colaboradores
    .filter((c) => chavesCozinha.has(normalizarCargo(c.jobTitle)))
    .map((c) => ({ collaboratorId: c.id, name: c.name }));

  const bruta = apurar({ vendedores: leitura.vendedores, pctVendedor: pcts.vendedor, pctCozinha: pcts.cozinha, vinculos, sugestoes, cozinha, foraPorFuncao });
  const { apuracao, erros: errosDeAjuste } = aplicarAjustes(bruta, e.ajustes ?? {});
  erros.push(...errosDeAjuste);

  const avisos = [...leitura.avisos];
  if (chavesCozinha.size === 0) avisos.push('Nenhuma função marcada para a cozinha em Configurações → Comissão: a parte do GRUPO BEIJA FLOR fica sem destinatário até você marcar as funções.');
  else if (cozinha.length === 0 && apuracao.totais.vendasGrupo > 0) avisos.push('Nenhum colaborador ativo desta unidade tem uma das funções marcadas para a cozinha — a parte do GRUPO BEIJA FLOR fica sem destinatário.');

  return {
    ok: true,
    previa: {
      unitId: unidade.id, unitName: unidade.name,
      mesVenda: e.mesVenda, mesApuracao: mesDeApuracao(e.mesVenda), competencia,
      rotulos: { venda: rotuloDoMes(e.mesVenda), apuracao: rotuloDoMes(mesDeApuracao(e.mesVenda)), pagamento: rotuloDoMes(competencia) },
      fileName: e.fileName, unidadeDeclarada: leitura.unidadeDeclarada,
      totalVendas: leitura.totalVendas, itens: leitura.itens,
      pctVendedor: pcts.vendedor, pctCozinha: pcts.cozinha,
      linhas: apuracao.linhas, totais: apuracao.totais, avisos,
      cozinhaSemFuncao: chavesCozinha.size === 0,
      jaExiste: Boolean(existente),
      existente: existente ? { importedByName: existente.importedByName, importedAt: existente.importedAt.toISOString(), totalAmount: dec(existente.totalAmount), replacedCount: existente.replacedCount } : null,
      fechada: Boolean(fechamento),
      erros,
    },
  };
}

export type ResultadoDaConfirmacao =
  | { ok: true; importId: string; competencia: string; lancamentos: number; total: number; substituiu: boolean }
  | { ok: false; reason: MotivoDaApuracao; erro: string };

/** Grava a apuração e os lançamentos de Comissão. Relê a planilha; nunca confia na prévia do navegador. */
export async function confirmarApuracao(user: SessionUser, e: Entrada, ctx: Ctx = {}): Promise<ResultadoDaConfirmacao> {
  const p = await montarPrevia(user, e);
  if (!p.ok) return p;
  const previa = p.previa;
  if (previa.erros.length > 0) return { ok: false, reason: 'AJUSTE', erro: previa.erros.join(' ') };
  if (previa.fechada) return { ok: false, reason: 'FECHADA', erro: `A competência ${previa.rotulos.pagamento} da Comissão já foi finalizada. Reabra em Comissão → Competência para apurar de novo.` };
  if (previa.jaExiste && !e.substituir) return { ok: false, reason: 'DUPLICADO', erro: `${previa.unitName} já tem apuração de ${previa.rotulos.venda}. Confirme a substituição para gravar por cima.` };

  const pagas = previa.linhas.filter((l) => l.collaboratorId && l.valor > 0);
  const substituiu = previa.jaExiste;

  const importId = await prisma.$transaction(async (tx) => {
    let replacedCount = 0;
    if (substituiu) {
      const velho = await tx.commissionImport.findUnique({ where: { unitId_salesMonth: { unitId: previa.unitId, salesMonth: previa.mesVenda } }, include: { lines: { select: { payoutId: true } } } });
      if (velho) {
        const ids = velho.lines.map((l) => l.payoutId).filter((x): x is string => Boolean(x));
        if (ids.length) await tx.collaboratorPayout.deleteMany({ where: { id: { in: ids }, type: 'COMMISSION' } });
        replacedCount = velho.replacedCount + 1;
        await tx.commissionImport.delete({ where: { id: velho.id } });
      }
    }
    const imp = await tx.commissionImport.create({
      data: {
        unitId: previa.unitId, salesMonth: previa.mesVenda, payMonth: previa.competencia, fileName: previa.fileName,
        unitDeclared: previa.unidadeDeclarada, totalSales: previa.totalVendas, groupSales: previa.totais.vendasGrupo,
        sellerPct: previa.pctVendedor, kitchenPct: previa.pctCozinha, totalAmount: previa.totais.comissao,
        replacedCount, importedById: user.id, importedByName: user.name,
      },
    });
    for (const l of previa.linhas) {
      let payoutId: string | null = null;
      if (l.collaboratorId && l.valor > 0) {
        const nota = l.kind === 'COZINHA'
          ? `Comissão cozinha ${previa.rotulos.venda} · venda do grupo R$ ${l.vendas.toFixed(2)} × ${l.pct}% ÷ ${previa.totais.cozinha}${l.ajuste ? ` · ajuste ${l.ajuste > 0 ? '+' : ''}${l.ajuste.toFixed(2)} (${l.motivoAjuste})` : ''}`
          : `Comissão ${previa.rotulos.venda} · venda R$ ${l.vendas.toFixed(2)} × ${l.pct}%${l.ajuste ? ` · ajuste ${l.ajuste > 0 ? '+' : ''}${l.ajuste.toFixed(2)} (${l.motivoAjuste})` : ''}`;
        const pay = await tx.collaboratorPayout.create({
          data: {
            collaboratorId: l.collaboratorId, collaboratorName: l.collaboratorName ?? l.nome, unitId: previa.unitId, type: 'COMMISSION',
            yearMonth: previa.competencia, amount: l.valor, note: nota.slice(0, 500), createdById: user.id, createdByName: user.name,
          },
        });
        payoutId = pay.id;
      }
      await tx.commissionLine.create({
        data: {
          importId: imp.id, kind: l.kind, sellerCode: l.codigo, sellerName: l.nome, sales: l.vendas, pct: l.pct,
          calculated: l.calculado, adjustment: l.ajuste, adjustmentNote: l.motivoAjuste, amount: l.valor,
          collaboratorId: l.collaboratorId, collaboratorName: l.collaboratorName, payoutId,
        },
      });
    }
    /* TODO vendedor casado (à mão, pelo nome inteiro ou pelo nome curto) fica lembrado pelo código do
       Teknisa: se o RH admitir amanhã outra "MARIA MERCES", a apuração do mês que vem não volta para a mão. */
    for (const linha of previa.linhas) {
      if (linha.kind !== 'VENDEDOR' || !linha.codigo || !linha.collaboratorId) continue;
      await tx.commissionSellerLink.upsert({
        where: { unitId_sellerCode: { unitId: previa.unitId, sellerCode: linha.codigo } },
        create: { unitId: previa.unitId, sellerCode: linha.codigo, sellerName: linha.nome, collaboratorId: linha.collaboratorId, createdByName: user.name },
        update: { sellerName: linha.nome, collaboratorId: linha.collaboratorId, createdByName: user.name },
      });
    }
    return imp.id;
  });

  await audit({
    userId: user.id, unitId: previa.unitId, action: substituiu ? 'COMMISSION_IMPORT_REPLACE' : 'COMMISSION_IMPORT', module: 'PEOPLE',
    entity: 'commission_import', entityId: importId,
    metadata: {
      unidade: previa.unitName, mesVenda: previa.mesVenda, competencia: previa.competencia, arquivo: previa.fileName,
      totalVendas: previa.totalVendas, comissao: previa.totais.comissao, lancamentos: pagas.length,
      ajustes: previa.linhas.filter((l) => l.ajuste).map((l) => ({ nome: l.nome, ajuste: l.ajuste, motivo: l.motivoAjuste })),
      vinculosManuais: Object.keys(e.vinculos ?? {}).length,
    },
    ...ctx,
  });
  return { ok: true, importId, competencia: previa.competencia, lancamentos: pagas.length, total: previa.totais.comissao, substituiu };
}

export interface ApuracaoResumo {
  id: string; unitId: string; unidade: string; mesVenda: string; competencia: string; fileName: string;
  totalVendas: number; comissao: number; linhasPagas: number; naoCadastrados: number; importedByName: string; importedAt: Date; replacedCount: number;
}

/** As apurações já feitas, no alcance do usuário, mais recentes primeiro. */
export async function listarApuracoes(user: SessionUser, limite = 24): Promise<ApuracaoResumo[]> {
  const imps = await prisma.commissionImport.findMany({
    where: unitScopeWhere(user, 'unitId'),
    orderBy: [{ salesMonth: 'desc' }, { importedAt: 'desc' }],
    take: limite,
    include: { lines: { select: { kind: true, payoutId: true } } },
  });
  const unidades = await prisma.unit.findMany({ where: { id: { in: [...new Set(imps.map((i) => i.unitId))] } }, select: { id: true, name: true } });
  const nome = new Map(unidades.map((u) => [u.id, u.name]));
  return imps.map((i) => ({
    id: i.id, unitId: i.unitId, unidade: nome.get(i.unitId) ?? '—', mesVenda: i.salesMonth, competencia: i.payMonth, fileName: i.fileName,
    totalVendas: dec(i.totalSales), comissao: dec(i.totalAmount),
    linhasPagas: i.lines.filter((l) => l.payoutId).length, naoCadastrados: i.lines.filter((l) => l.kind === 'NAO_CADASTRADO').length,
    importedByName: i.importedByName, importedAt: i.importedAt, replacedCount: i.replacedCount,
  }));
}

/** Uma apuração com as linhas, para conferência depois de gravada. */
export async function getApuracao(user: SessionUser, id: string) {
  const imp = await prisma.commissionImport.findUnique({ where: { id }, include: { lines: { orderBy: [{ kind: 'asc' }, { sales: 'desc' }] } } });
  if (!imp || !canAccessUnit(user, imp.unitId)) return null;
  const unidade = await prisma.unit.findUnique({ where: { id: imp.unitId }, select: { name: true } });
  return {
    id: imp.id, unitId: imp.unitId, unidade: unidade?.name ?? '—', mesVenda: imp.salesMonth, competencia: imp.payMonth, fileName: imp.fileName,
    unidadeDeclarada: imp.unitDeclared, totalVendas: dec(imp.totalSales), vendasGrupo: dec(imp.groupSales), pctVendedor: dec(imp.sellerPct), pctCozinha: dec(imp.kitchenPct),
    comissao: dec(imp.totalAmount), importedByName: imp.importedByName, importedAt: imp.importedAt, replacedCount: imp.replacedCount,
    linhas: imp.lines.map((l) => ({
      id: l.id, kind: l.kind, codigo: l.sellerCode, nome: l.sellerName, vendas: dec(l.sales), pct: dec(l.pct), calculado: dec(l.calculated),
      ajuste: dec(l.adjustment), motivoAjuste: l.adjustmentNote, valor: dec(l.amount), collaboratorId: l.collaboratorId, collaboratorName: l.collaboratorName, payoutId: l.payoutId,
    })),
  };
}
