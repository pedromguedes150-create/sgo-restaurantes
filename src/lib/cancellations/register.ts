import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type RegisterResult =
  | { ok: true; id: string; juntouAoImportado: boolean }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NO_PHOTO' | 'DUPLICATE' };

export interface RegisterInput {
  unitId: string;
  couponNumber: string;
  value: number;
  /** Hora do cancelamento, ISO completo. Padrão da tela: agora. */
  canceledAt?: string;
  cashOperator?: string;
  reasonId?: string;
  note?: string;
  /** Caminho da foto já salva no volume de uploads. */
  photoPath: string;
}

/** Número do cupom sem zeros à esquerda e sem espaços — "0042" e "42" são o mesmo cupom. */
export function normalizeCouponNumber(raw: string): string {
  const limpo = (raw ?? '').trim().replace(/\s+/g, '');
  const semZeros = limpo.replace(/^0+(?=\d)/, '');
  return semZeros;
}

/**
 * Registro do cancelamento pelo gerente, com foto do cupom.
 *
 * Por que existe, se o relatório do Teknisa já traz os cancelamentos: o
 * relatório chega depois, e a essa altura o cupom já foi para o lixo. A foto só
 * existe se alguém a tirar na hora.
 *
 * E por que o relatório continua entrando: ele é o que garante que TODO
 * cancelamento aparece. Se o controle dependesse só do lançamento manual, o
 * cancelamento suspeito simplesmente não seria lançado — e um controle que o
 * controlado pode omitir não controla nada. As duas pernas se cruzam depois.
 */
export async function registerCancellation(
  user: SessionUser,
  input: RegisterInput,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<RegisterResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.photoPath) return { ok: false, reason: 'NO_PHOTO' };

  const coupon = normalizeCouponNumber(input.couponNumber);
  if (!coupon) return { ok: false, reason: 'INVALID' };

  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'INVALID' };

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { timezone: true, cutoffHour: true } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  /* Hora informada vira também a DATA OPERACIONAL do registro: um cancelamento
     à 01h pertence ao dia anterior de operação, e usar "hoje" jogaria a
     conciliação com o Teknisa para o dia errado. */
  const quando = input.canceledAt ? new Date(input.canceledAt) : new Date();
  if (Number.isNaN(quando.getTime())) return { ok: false, reason: 'INVALID' };
  if (quando.getTime() > Date.now() + 60_000) return { ok: false, reason: 'INVALID' };
  const operationalDate = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }, quando);

  const reason = input.reasonId
    ? await prisma.cancellationReason.findUnique({ where: { id: input.reasonId }, select: { id: true, name: true } })
    : null;
  if (input.reasonId && !reason) return { ok: false, reason: 'INVALID' };

  /* JÁ VEIO DO TEKNISA? Então a foto COMPLETA aquele registro, não cria outro.
     Duplicar contaria o mesmo cancelamento duas vezes no total do mês. */
  const importado = await prisma.cancellation.findFirst({
    where: { unitId: input.unitId, operationalDate, couponNumber: coupon, source: 'IMPORT' },
    select: { id: true, photoPath: true },
  });

  if (importado) {
    if (importado.photoPath) return { ok: false, reason: 'DUPLICATE' };
    await prisma.cancellation.update({
      where: { id: importado.id },
      data: {
        photoPath: input.photoPath,
        canceledAt: quando,
        registeredById: user.id,
        ...(reason ? { reasonId: reason.id, status: 'JUSTIFIED', justifiedById: user.id, justifiedAt: new Date() } : {}),
        ...(input.note?.trim() ? { justificationNote: input.note.trim() } : {}),
      },
    });
    await audit({
      userId: user.id, unitId: input.unitId, action: 'CANCELLATION_PHOTO', module: 'CANCELLATIONS',
      entity: 'cancellation', entityId: importado.id, metadata: { coupon, reason: reason?.name ?? null }, ...ctx,
    });
    return { ok: true, id: importado.id, juntouAoImportado: true };
  }

  /* Mesmo cupom registrado à mão duas vezes: é engano, não dois cancelamentos. */
  const jaRegistrado = await prisma.cancellation.findFirst({
    where: { unitId: input.unitId, operationalDate, couponNumber: coupon, source: 'MANUAL' },
    select: { id: true },
  });
  if (jaRegistrado) return { ok: false, reason: 'DUPLICATE' };

  const criado = await prisma.cancellation.create({
    data: {
      unitId: input.unitId,
      operationalDate,
      couponNumber: coupon,
      value,
      cashOperator: input.cashOperator?.trim() || null,
      photoPath: input.photoPath,
      canceledAt: quando,
      source: 'MANUAL',
      registeredById: user.id,
      /* Com motivo, já nasce justificado: exigir que o gerente volte para
         justificar o que ele mesmo acabou de explicar seria trabalho repetido. */
      ...(reason
        ? { reasonId: reason.id, status: 'JUSTIFIED', justifiedById: user.id, justifiedAt: new Date() }
        : { status: 'PENDING' }),
      justificationNote: input.note?.trim() || null,
    },
    select: { id: true },
  });

  await audit({
    userId: user.id, unitId: input.unitId, action: 'CANCELLATION_REGISTER', module: 'CANCELLATIONS',
    entity: 'cancellation', entityId: criado.id, metadata: { coupon, value, reason: reason?.name ?? null }, ...ctx,
  });

  return { ok: true, id: criado.id, juntouAoImportado: false };
}
