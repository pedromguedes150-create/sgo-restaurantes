import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifyUsers } from '@/lib/notifications';
import { currentOperationalDate } from '@/lib/date/operational';
import { getGasAlertPct } from '@/lib/gas/query';
import type { SessionUser } from '@/lib/auth/session';

export interface CreateGasInput {
  unitId: string;
  supplierId?: string;
  quantityKg?: number;
  /** Preço unitário (R$/kg) — quando informado, o total é calculado (qtd × unitário). */
  pricePerKg?: number;
  /** Valor total (alternativa ao unitário; preço/kg = total ÷ kg). */
  totalValue?: number;
  operationalDate?: string;
  accessKey?: string;
  noteNumber?: string;
  /** Vencimento do boleto (YYYY-MM-DD) — usado no acompanhamento de vencimentos. */
  dueDate?: string;
  observation?: string;
  // Botijão (P45 etc.) — converte para kg (count × cylinderKg)
  kind?: 'BULK' | 'CYLINDER';
  cylinderCount?: number;
  cylinderKg?: number;
  cylindersReturned?: number;
}
export type CreateGasResult =
  | { ok: true; id: string; pricePerKg: number; variationPct: number | null; alerted: boolean }
  /** `message` sobrepõe o texto padrão do motivo quando a causa tem detalhe
   *  útil (ex.: o número da nota que já existe). */
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'DUPLICATE'; message?: string };

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Registra um recebimento de gás (granel/kg) e calcula preço/kg + variação/alerta. */
export async function createGasReceipt(user: SessionUser, input: CreateGasInput, ctx: Ctx = {}): Promise<CreateGasResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  const isCylinder = input.kind === 'CYLINDER';
  const cylinderKg = isCylinder ? Math.max(1, Math.trunc(Number(input.cylinderKg) || 45)) : null;
  const cylinderCount = isCylinder ? Math.trunc(Number(input.cylinderCount) || 0) : null;
  const cylindersReturned = isCylinder && input.cylindersReturned != null ? Math.max(0, Math.trunc(Number(input.cylindersReturned))) : null;

  // Botijão: kg = nº de botijões × kg por botijão. Granel: kg direto.
  const qty = isCylinder ? (cylinderCount! * cylinderKg!) : Number(input.quantityKg);
  const unitPrice = input.pricePerKg != null ? Number(input.pricePerKg) : NaN;
  const hasUnit = !isCylinder && Number.isFinite(unitPrice) && unitPrice > 0;
  const total = hasUnit ? Math.round(qty * unitPrice * 100) / 100 : Number(input.totalValue);
  if (!(qty > 0) || !(total > 0)) return { ok: false, reason: 'INVALID' };

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { timezone: true, cutoffHour: true, name: true } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const pricePerKg = hasUnit ? Math.round(unitPrice * 10000) / 10000 : Math.round((total / qty) * 10000) / 10000;
  const opDate = input.operationalDate && /^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate)
    ? input.operationalDate
    : currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });

  // Compra anterior da MESMA unidade (referência da variação)
  const prev = await prisma.gasReceipt.findFirst({
    where: { unitId: input.unitId },
    orderBy: [{ operationalDate: 'desc' }, { createdAt: 'desc' }],
    select: { pricePerKg: true },
  });
  const prevPrice = prev ? Number(prev.pricePerKg) : null;
  const variationPct = prevPrice && prevPrice > 0 ? Math.round(((pricePerKg - prevPrice) / prevPrice) * 1000) / 10 : null;
  const threshold = await getGasAlertPct();
  const alerted = variationPct != null && variationPct > threshold;

  /**
   * O banco tem `@@unique([unitId, supplierId, noteNumber])` — a mesma nota do
   * mesmo fornecedor não entra duas vezes na mesma unidade, e isso está certo:
   * recebimento duplicado entra na média de preço/kg e no abatimento do
   * contrato, estragando o número que o módulo existe para vigiar.
   *
   * O que estava errado era a REAÇÃO. O Prisma lança P2002, ninguém pegava, a
   * rota devolvia 500 sem corpo e o gerente lia só "Falha" — sem saber que o
   * problema era o número repetido, e sem nada a fazer além de tentar de novo
   * e falhar igual. Foi assim que o Pedro travou com a nota 5424.
   */
  let rec: { id: string };
  try {
    rec = await criar();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return {
        ok: false,
        reason: 'DUPLICATE',
        message: input.noteNumber
          ? `Já existe um recebimento com o nº ${input.noteNumber} deste fornecedor nesta unidade. Se for outro recebimento, confira o número da nota; se já lançou este, ele está na aba Histórico.`
          : 'Este recebimento já foi lançado para este fornecedor nesta unidade. Confira a aba Histórico.',
      };
    }
    throw e;
  }

  async function criar() {
    return prisma.gasReceipt.create({
    data: {
      unitId: input.unitId,
      supplierId: input.supplierId || null,
      operationalDate: opDate,
      accessKey: input.accessKey || null,
      noteNumber: input.noteNumber || null,
      dueDate: input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? new Date(`${input.dueDate}T12:00:00`) : null,
      kind: isCylinder ? 'CYLINDER' : 'BULK',
      cylinderCount,
      cylinderKg,
      cylindersReturned,
      quantityKg: qty,
      totalValue: total,
      pricePerKg,
      prevPricePerKg: prevPrice,
      variationPct,
      alerted,
      observation: input.observation?.trim() || null,
      createdById: user.id,
    },
    select: { id: true },
    });
  }

  /**
   * A PARTIR DAQUI o recebimento JÁ ESTÁ GRAVADO.
   *
   * Auditoria e aviso são efeitos posteriores, e nenhum deles pode derrubar a
   * resposta: se um deles estourasse, a rota devolvia 500, o gerente lia
   * "Falha" e lançava de novo — gravando o MESMO recebimento duas vezes. E
   * recebimento duplicado não é só sujeira na lista: ele entra na média de
   * preço/kg e no abatimento do contrato, então estraga justamente o número
   * que o módulo existe para vigiar.
   *
   * Falhar em avisar é um problema menor que fazer o gerente duplicar dado.
   */
  try {
    await audit({ userId: user.id, unitId: input.unitId, action: 'GAS_RECEIPT', module: 'GAS', entity: 'gas_receipt', entityId: rec.id, metadata: { pricePerKg, qty, total, variationPct, alerted }, ...ctx });
  } catch (e) {
    console.error('[gas] recebimento gravado, mas a auditoria falhou:', e);
  }

  if (alerted && variationPct != null && prevPrice != null) {
    try {
      const body = `Gás em ${unit.name}: R$ ${pricePerKg.toFixed(4)}/kg (+${variationPct.toFixed(1)}% vs anterior R$ ${prevPrice.toFixed(4)}/kg).`;
      await notifyUnitRole(input.unitId, 'SUPERVISOR', { title: '⚠ Alta no preço do gás', body, link: '/modulos/notas/gas', module: 'GAS', critical: true });
      await notifyUsers([user.id], { title: '⚠ Preço do gás acima do normal', body, link: '/modulos/notas/gas', module: 'GAS' });
    } catch (e) {
      console.error('[gas] recebimento gravado, mas o alerta de variação falhou:', e);
    }
  }

  return { ok: true, id: rec.id, pricePerKg, variationPct, alerted };
}

export interface EditGasInput { quantityKg?: number; totalValue?: number; supplierId?: string | null; observation?: string | null }
export type EditGasResult = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

/**
 * Corrige um lançamento de gás (erro de digitação do gerente) — Supervisão/Admin.
 * Recalcula preço/kg e variação; NÃO mexe na meta (só a edição de DATA penaliza).
 */
export async function editGasReceipt(user: SessionUser, id: string, input: EditGasInput, ctx: Ctx = {}): Promise<EditGasResult> {
  if (!['ADMIN', 'SUPERVISOR', 'CEO'].includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const rec = await prisma.gasReceipt.findUnique({ where: { id }, select: { id: true, unitId: true, quantityKg: true, totalValue: true, prevPricePerKg: true, supplierId: true, observation: true } });
  if (!rec) return { ok: false, reason: 'NOT_FOUND' };
  try { assertUnitAccess(user, rec.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  const qty = input.quantityKg != null ? Number(input.quantityKg) : Number(rec.quantityKg);
  const total = input.totalValue != null ? Number(input.totalValue) : Number(rec.totalValue);
  if (!(qty > 0) || !(total > 0)) return { ok: false, reason: 'INVALID' };
  const pricePerKg = Math.round((total / qty) * 10000) / 10000;
  const prevPrice = rec.prevPricePerKg != null ? Number(rec.prevPricePerKg) : null;
  const variationPct = prevPrice && prevPrice > 0 ? Math.round(((pricePerKg - prevPrice) / prevPrice) * 1000) / 10 : null;
  const threshold = await getGasAlertPct();
  const alerted = variationPct != null && variationPct > threshold;

  await prisma.gasReceipt.update({
    where: { id },
    data: {
      quantityKg: qty,
      totalValue: total,
      pricePerKg,
      variationPct,
      alerted,
      supplierId: input.supplierId === undefined ? rec.supplierId : (input.supplierId || null),
      observation: input.observation === undefined ? rec.observation : (input.observation?.trim() || null),
    },
  });
  await audit({ userId: user.id, unitId: rec.unitId, action: 'GAS_RECEIPT_EDIT', module: 'GAS', entity: 'gas_receipt', entityId: id, metadata: { qty, total, pricePerKg }, ...ctx });
  return { ok: true };
}
