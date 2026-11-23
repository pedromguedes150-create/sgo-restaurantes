import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * AUDITORIA DO INVENTÁRIO DE UTENSÍLIOS — exigida ou não (v1.219.0).
 *
 * Pedido do Daniel (20/11/2026): "de primeiro momento não será necessário
 * auditar". A chave nasce DESLIGADA: enviar já conclui o inventário e a
 * Supervisão só é avisada. Ligada, volta o fluxo de sempre (Pendente de
 * auditoria → aprovar ou devolver). O que já estava pendente quando a chave
 * foi desligada continua pendente e é aprovado à mão — nada é concluído
 * sozinho.
 */
const KEY = 'UTENSILS_AUDIT_REQUIRED';

export async function exigeAuditoria(): Promise<boolean> {
  const s = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return s?.value === 'true';
}

export async function definirAuditoria(user: SessionUser, exigir: boolean, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (!['ADMIN', 'CEO'].includes(user.role)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  const value = exigir ? 'true' : 'false';
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  await audit({ userId: user.id, action: 'UTENSIL_AUDIT_REQUIRED_SET', module: 'CONFIG', metadata: { exigir }, ...ctx });
  return { ok: true as const };
}
