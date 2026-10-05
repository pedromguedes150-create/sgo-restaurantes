import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * FOTO NO DESPERDÍCIO DO RESTAURANTE — obrigatória ou não (v1.152.0).
 *
 * Pedido do Pedro (05/10/2026): "na aba de desperdício ainda não precisa cobrar
 * foto, mas futuramente será necessário". Até aqui a cobrança vinha de dois
 * lugares que não concordavam: a TELA exigia uma foto por procedimento com peso,
 * e o SERVIDOR exigia "alguma foto" só se o checklist WASTE estivesse marcado
 * com `requiresEvidence` (o do seed está). Esta chave passa a ser a regra ÚNICA,
 * lida pela tela e pelo servidor:
 *  - DESLIGADA (padrão): a foto é opcional — o gerente pode tirar, e ela aparece
 *    na conferência; ninguém é barrado por não ter.
 *  - LIGADA: cada procedimento com peso > 0 precisa da sua foto (nova ou já
 *    gravada naquele dia).
 *
 * A frente Salgados NÃO lê esta chave: lá a foto do recipiente já é obrigatória.
 */
const KEY = 'WASTE_PHOTO_REQUIRED';

export async function getWastePhotoRequired(): Promise<boolean> {
  const s = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return s?.value === 'true';
}

export async function setWastePhotoRequired(
  user: SessionUser,
  required: boolean,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const value = required ? 'true' : 'false';
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  await audit({ userId: user.id, action: 'WASTE_PHOTO_REQUIRED_SET', module: 'CONFIG', metadata: { required }, ...ctx });
  return { ok: true as const };
}
