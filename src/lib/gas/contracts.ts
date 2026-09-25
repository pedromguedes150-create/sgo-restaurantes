import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { saveAttachment } from '@/lib/uploads';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Contratos de gás (16/07): por UNIDADE+FORNECEDOR, com período, quantidade
 * (kg) e preço/kg acordados. Baixa automática: recebimentos lançados da
 * unidade+fornecedor dentro do período abatem a quantidade. initialUsedKg =
 * posição de contrato que já estava em andamento antes do SGO.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function canManage(user: SessionUser): boolean {
  return user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO';
}

export async function createGasContract(
  user: SessionUser,
  input: { unitId: string; supplierId: string; startDate: string; endDate: string; quantityKg: number; pricePerKg: number; initialUsedKg?: number; note?: string },
  ctx: Ctx = {},
): Promise<Result> {
  if (!canManage(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate) || input.endDate < input.startDate) return { ok: false, reason: 'INVALID' };
  if (!(input.quantityKg > 0) || !(input.pricePerKg > 0)) return { ok: false, reason: 'INVALID' };
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { name: true } });
  if (!supplier) return { ok: false, reason: 'NOT_FOUND' };

  const c = await prisma.gasContract.create({
    data: {
      unitId: input.unitId, supplierId: input.supplierId,
      startDate: input.startDate, endDate: input.endDate,
      quantityKg: input.quantityKg, pricePerKg: input.pricePerKg,
      initialUsedKg: Math.max(0, input.initialUsedKg ?? 0),
      note: input.note?.trim() || null,
      createdById: user.id, createdByName: user.name,
    },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'GAS_CONTRACT_CREATE', module: 'GAS', entity: 'gas_contract', entityId: c.id, metadata: { supplier: supplier.name, kg: input.quantityKg, price: input.pricePerKg }, ...ctx });
  return { ok: true, id: c.id };
}

export async function updateGasContract(
  user: SessionUser,
  id: string,
  input: { startDate?: string; endDate?: string; quantityKg?: number; pricePerKg?: number; initialUsedKg?: number; note?: string; active?: boolean },
  ctx: Ctx = {},
): Promise<Result> {
  if (!canManage(user)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.gasContract.findUnique({ where: { id }, select: { unitId: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, c.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.startDate !== undefined && !DATE_RE.test(input.startDate)) return { ok: false, reason: 'INVALID' };
  if (input.endDate !== undefined && !DATE_RE.test(input.endDate)) return { ok: false, reason: 'INVALID' };

  await prisma.gasContract.update({
    where: { id },
    data: {
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.quantityKg !== undefined && input.quantityKg > 0 ? { quantityKg: input.quantityKg } : {}),
      ...(input.pricePerKg !== undefined && input.pricePerKg > 0 ? { pricePerKg: input.pricePerKg } : {}),
      ...(input.initialUsedKg !== undefined ? { initialUsedKg: Math.max(0, input.initialUsedKg) } : {}),
      ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
      ...(input.active !== undefined ? { active: Boolean(input.active) } : {}),
    },
  });
  await audit({ userId: user.id, unitId: c.unitId, action: 'GAS_CONTRACT_UPDATE', module: 'GAS', entity: 'gas_contract', entityId: id, metadata: { fields: Object.keys(input) }, ...ctx });
  return { ok: true };
}

export async function deleteGasContract(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Result> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.gasContract.findUnique({ where: { id }, select: { unitId: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.gasContract.delete({ where: { id } });
  await audit({ userId: user.id, unitId: c.unitId, action: 'GAS_CONTRACT_DELETE', module: 'GAS', entity: 'gas_contract', entityId: id, ...ctx });
  return { ok: true };
}

/** Versão de documento PDF/imagem anexada a um contrato. */
export interface ContractDoc {
  id: string;
  path: string;
  fileName: string | null;
  mimeType: string | null;
  uploadedAt: string; // ISO
  uploadedByName: string | null;
}

/** Uma nota que NÃO entrou no contrato, e o motivo. */
export interface ForaDoContrato {
  id: string;
  date: string;
  kg: number;
  supplierName: string;
  motivo: 'FORA_DO_PERIODO' | 'OUTRO_FORNECEDOR' | 'SEM_FORNECEDOR';
}

export interface GasContractRow {
  id: string; unitId: string; unitName: string; supplierId: string; supplierName: string;
  startDate: string; endDate: string; quantityKg: number; pricePerKg: number; initialUsedKg: number;
  purchasedKg: number; // recebimentos no período (SGO)
  usedKg: number; // initialUsedKg + purchasedKg
  progressPct: number; // usedKg ÷ quantityKg
  remainingKg: number;
  expired: boolean; active: boolean; note: string | null;
  /**
   * As notas DA MESMA UNIDADE que ficaram de fora, com o motivo.
   *
   * Não existe FK entre `GasReceipt` e `GasContract`: o vínculo é INFERIDO por
   * unidade + fornecedor + janela de datas, e qualquer uma das três exclui uma
   * nota sem dizer nada. Foi assim que 429 kg sumiram de um contrato e a
   * divergência só apareceu quando alguém somou a lista na mão.
   *
   * Enquanto não há FK, o mínimo é o contrato **conseguir explicar o próprio
   * número** — listando o que deixou de fora e por quê.
   */
  foraDoContrato: ForaDoContrato[];
  /** Soma do que ficou de fora, para a tela mostrar a diferença de uma vez. */
  foraDoContratoKg: number;
  /** Documentos anexados ao contrato (PDF/imagem), do mais recente ao mais antigo. */
  documents: ContractDoc[];
}

/** Contratos do escopo com a posição/baixa calculada dos recebimentos. */
export async function listGasContracts(user: SessionUser, opts: { activeOnly?: boolean } = {}): Promise<GasContractRow[]> {
  const contracts = await prisma.gasContract.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.activeOnly ? { active: true } : {}) },
    orderBy: [{ active: 'desc' }, { endDate: 'asc' }],
    include: { documents: { orderBy: { uploadedAt: 'desc' } } },
  });
  if (contracts.length === 0) return [];
  const [units, suppliers] = await Promise.all([
    prisma.unit.findMany({ where: { id: { in: [...new Set(contracts.map((c) => c.unitId))] } }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { id: { in: [...new Set(contracts.map((c) => c.supplierId))] } }, select: { id: true, name: true } }),
  ]);
  const unitBy = new Map(units.map((u) => [u.id, u.name]));
  const supBy = new Map(suppliers.map((s) => [s.id, s.name]));
  const today = new Date().toISOString().slice(0, 10);

  /**
   * TODAS as notas das unidades com contrato, de uma vez.
   *
   * Antes era um `aggregate` por contrato — nove idas ao banco para nove
   * contratos, e nenhuma delas capaz de dizer o que tinha deixado de fora. A
   * classificação abaixo é a mesma regra de sempre (unidade + fornecedor +
   * janela); o que mudou é que agora o RESTO também é contado.
   */
  const notas = await prisma.gasReceipt.findMany({
    where: { unitId: { in: [...new Set(contracts.map((c) => c.unitId))] } },
    select: { id: true, unitId: true, supplierId: true, operationalDate: true, quantityKg: true, supplier: { select: { name: true } } },
  });

  const out: GasContractRow[] = [];
  for (const c of contracts) {
    const daUnidade = notas.filter((n) => n.unitId === c.unitId);

    let purchasedKg = 0;
    const foraDoContrato: ForaDoContrato[] = [];
    for (const n of daUnidade) {
      const noPeriodo = n.operationalDate >= c.startDate && n.operationalDate <= c.endDate;
      const doFornecedor = n.supplierId === c.supplierId;
      if (noPeriodo && doFornecedor) { purchasedKg += Number(n.quantityKg); continue; }

      /* Nota de OUTRO fornecedor e FORA do período não diz nada sobre este
         contrato — listá-la encheria a tela de ruído. Só entra no aviso o que
         quase entrou: mesmo fornecedor fora do período, ou mesmo período com
         fornecedor diferente. */
      if (doFornecedor && !noPeriodo) {
        foraDoContrato.push({ id: n.id, date: n.operationalDate, kg: Number(n.quantityKg), supplierName: n.supplier?.name ?? '—', motivo: 'FORA_DO_PERIODO' });
      } else if (noPeriodo && !doFornecedor) {
        foraDoContrato.push({
          id: n.id, date: n.operationalDate, kg: Number(n.quantityKg),
          supplierName: n.supplier?.name ?? 'Sem fornecedor',
          /* Sem fornecedor é um caso à parte: não é "de outro", é dado
             incompleto — e o conserto é diferente (preencher, não discutir). */
          motivo: n.supplierId ? 'OUTRO_FORNECEDOR' : 'SEM_FORNECEDOR',
        });
      }
    }
    foraDoContrato.sort((a, b) => a.date.localeCompare(b.date));

    const usedKg = Number(c.initialUsedKg) + purchasedKg;
    const quantityKg = Number(c.quantityKg);
    out.push({
      id: c.id, unitId: c.unitId, unitName: unitBy.get(c.unitId) ?? '—',
      supplierId: c.supplierId, supplierName: supBy.get(c.supplierId) ?? '—',
      startDate: c.startDate, endDate: c.endDate,
      quantityKg, pricePerKg: Number(c.pricePerKg), initialUsedKg: Number(c.initialUsedKg),
      purchasedKg: Math.round(purchasedKg * 100) / 100,
      usedKg: Math.round(usedKg * 100) / 100,
      progressPct: quantityKg > 0 ? Math.min(999, Math.round((usedKg / quantityKg) * 100)) : 0,
      remainingKg: Math.round((quantityKg - usedKg) * 100) / 100,
      expired: c.endDate < today,
      active: c.active, note: c.note,
      foraDoContrato,
      foraDoContratoKg: Math.round(foraDoContrato.reduce((s, f) => s + f.kg, 0) * 100) / 100,
      documents: c.documents.map((d) => ({
        id: d.id,
        path: d.path,
        fileName: d.fileName,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt.toISOString(),
        uploadedByName: d.uploadedByName,
      })),
    });
  }
  return out;
}

/**
 * Uma unidade que RECEBE gás mas não tem contrato vigente para explicar as
 * notas — e o motivo.
 *
 * O painel "Contratos vigentes — % cumprido" mostra só contratos `active` e não
 * vencidos (a definição de vigente). Uma unidade cujo contrato venceu, foi
 * inativado, ou nunca teve contrato, simplesmente SOME do painel — sem nada
 * dizer que ela ainda compra gás nem por que o contrato não conta. É a mesma
 * exclusão silenciosa que este módulo já combate nota a nota (`foraDoContrato`):
 * aqui ela acontece um nível acima, na unidade inteira.
 *
 * Foi o que aconteceu com a Nova União: recebimentos vinculados à unidade
 * (por ID), aparecendo no histórico, mas ausentes da área de contratos. Este
 * levantamento faz a unidade aparecer com o motivo — sem inventar contrato,
 * sem redistribuir nota e sem tocar no cálculo de quem tem contrato vigente.
 */
export interface UnidadeSemContratoVigente {
  unitId: string;
  unitName: string;
  receiptsKg: number;
  receiptsCount: number;
  lastReceiptDate: string;
  motivo: 'SEM_CONTRATO' | 'CONTRATO_VENCIDO' | 'CONTRATO_INATIVO';
  /** O contrato mais recente da unidade, quando existe (para o conserto: renovar/reativar). */
  ultimoContrato?: { id: string; startDate: string; endDate: string; active: boolean; supplierName: string };
}

/**
 * Unidades DO ESCOPO que receberam gás recentemente e não têm contrato vigente.
 *
 * Vínculo 100% por ID (unitId): a mesma chave que liga recebimento e contrato
 * em `listGasContracts`. Nenhuma comparação por nome/razão social.
 *
 * Janela de 180 dias no ÚLTIMO recebimento: uma unidade que parou de comprar há
 * tempos e não tem contrato não é pendência acionável — nagging não é sinal.
 */
export async function listUnitsWithReceiptsWithoutActiveContract(
  user: SessionUser,
  opts: { sinceDays?: number } = {},
): Promise<UnidadeSemContratoVigente[]> {
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - (opts.sinceDays ?? 180) * 86_400_000).toISOString().slice(0, 10);

  const porUnidade = await prisma.gasReceipt.groupBy({
    by: ['unitId'],
    where: { ...unitScopeWhere(user, 'unitId') },
    _sum: { quantityKg: true },
    _count: { _all: true },
    _max: { operationalDate: true },
  });
  // Só quem recebeu dentro da janela (o último recebimento é recente).
  const recentes = porUnidade.filter((u) => (u._max.operationalDate ?? '') >= cutoff);
  if (recentes.length === 0) return [];

  const unitIds = recentes.map((u) => u.unitId);
  const [units, contracts] = await Promise.all([
    prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } }),
    prisma.gasContract.findMany({ where: { unitId: { in: unitIds } }, select: { id: true, unitId: true, active: true, startDate: true, endDate: true, supplierId: true } }),
  ]);
  const unitBy = new Map(units.map((u) => [u.id, u.name]));
  const supIds = [...new Set(contracts.map((c) => c.supplierId))];
  const suppliers = supIds.length ? await prisma.supplier.findMany({ where: { id: { in: supIds } }, select: { id: true, name: true } }) : [];
  const supBy = new Map(suppliers.map((s) => [s.id, s.name]));

  const contratosPorUnidade = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const arr = contratosPorUnidade.get(c.unitId) ?? [];
    arr.push(c);
    contratosPorUnidade.set(c.unitId, arr);
  }

  const out: UnidadeSemContratoVigente[] = [];
  for (const u of recentes) {
    const doUnidade = contratosPorUnidade.get(u.unitId) ?? [];
    // "Vigente" = a MESMA regra do painel (linha 84 do gas-client): ativo e não vencido.
    const temVigente = doUnidade.some((c) => c.active && c.endDate >= today);
    if (temVigente) continue; // já aparece em "% cumprido"

    let motivo: UnidadeSemContratoVigente['motivo'];
    let ultimoContrato: UnidadeSemContratoVigente['ultimoContrato'];
    if (doUnidade.length === 0) {
      motivo = 'SEM_CONTRATO';
    } else {
      // O mais recente pela data de fim (desempate: início) explica a situação.
      const latest = [...doUnidade].sort((a, b) => (b.endDate.localeCompare(a.endDate) || b.startDate.localeCompare(a.startDate)))[0];
      motivo = latest.endDate < today ? 'CONTRATO_VENCIDO' : 'CONTRATO_INATIVO';
      ultimoContrato = { id: latest.id, startDate: latest.startDate, endDate: latest.endDate, active: latest.active, supplierName: supBy.get(latest.supplierId) ?? '—' };
    }

    out.push({
      unitId: u.unitId,
      unitName: unitBy.get(u.unitId) ?? '—',
      receiptsKg: Math.round(Number(u._sum.quantityKg ?? 0) * 100) / 100,
      receiptsCount: u._count._all,
      lastReceiptDate: u._max.operationalDate ?? '',
      motivo,
      ultimoContrato,
    });
  }
  out.sort((a, b) => b.receiptsKg - a.receiptsKg);
  return out;
}

/** Total comprado (kg e R$) dentro dos filtros do dashboard (unidade/fornecedor/mês). */
export async function getGasPurchasedInFilter(user: SessionUser, filters: { unitId?: string; supplierId?: string; yearMonth?: string }): Promise<{ kg: number; total: number; count: number }> {
  const agg = await prisma.gasReceipt.aggregate({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.yearMonth ? { operationalDate: { startsWith: filters.yearMonth } } : {}),
    },
    _sum: { quantityKg: true, totalValue: true },
    _count: true,
  });
  return {
    kg: Math.round(Number(agg._sum.quantityKg ?? 0) * 100) / 100,
    total: Math.round(Number(agg._sum.totalValue ?? 0) * 100) / 100,
    count: agg._count,
  };
}

/**
 * Anexa um documento (PDF ou imagem) a um contrato de gás.
 *
 * Cada upload gera um registro em `GasContractDocument` — versões anteriores
 * não são apagadas, para que o histórico de negociação fique preservado.
 */
export async function attachContractDocument(
  user: SessionUser,
  contractId: string,
  file: File,
  ctx: Ctx = {},
): Promise<{ ok: true; doc: ContractDoc } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' }> {
  if (!canManage(user)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.gasContract.findUnique({ where: { id: contractId }, select: { id: true, unitId: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, c.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  let saved: { path: string; mimeType: string };
  try {
    saved = await saveAttachment(file, c.unitId, `gas-contrato-${contractId}`);
  } catch {
    return { ok: false, reason: 'INVALID' };
  }

  const doc = await prisma.gasContractDocument.create({
    data: {
      contractId,
      path: saved.path,
      fileName: file.name || null,
      mimeType: saved.mimeType || null,
      uploadedById: user.id,
      uploadedByName: user.name,
    },
  });

  await audit({
    userId: user.id, unitId: c.unitId,
    action: 'GAS_CONTRACT_DOCUMENT_ATTACH',
    module: 'GAS', entity: 'gas_contract', entityId: contractId,
    metadata: { fileName: file.name, size: file.size },
    ...ctx,
  });

  return {
    ok: true,
    doc: {
      id: doc.id,
      path: doc.path,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt.toISOString(),
      uploadedByName: doc.uploadedByName,
    },
  };
}
