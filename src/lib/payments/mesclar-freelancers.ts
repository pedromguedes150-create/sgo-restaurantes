import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * MESCLAR dois cadastros de freelancer — o duplicado entra no definitivo.
 *
 * O que NÃO se faz aqui: excluir o duplicado e deixar as solicitações sem dono
 * (o FK é SetNull — o histórico ficaria "sem freelancer", e a recorrência e os
 * consolidados deixariam de contar a pessoa). O que se faz, numa transação:
 *
 *   1. as solicitações do duplicado passam a apontar para o definitivo — os
 *      campos congelados em cada uma (nome, valor, PIX da época) NÃO são
 *      reescritos: o histórico continua dizendo o que foi;
 *   2. as unidades do duplicado são SOMADAS às do definitivo;
 *   3. valores por setor que o definitivo não tem são copiados;
 *   4. CPF/PIX do duplicado preenchem o definitivo se ele estiver sem;
 *   5. só então o duplicado, já vazio, é removido.
 *
 * Só o Admin, e fica na Auditoria com os números.
 */
export type MesclagemResult =
  | { ok: true; id: string; solicitacoes: number; unidadesSomadas: number; setoresCopiados: number }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT'; message?: string };

export async function mesclarFreelancers(
  user: SessionUser,
  input: { duplicadoId: string; destinoId: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<MesclagemResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const { duplicadoId, destinoId } = input;
  if (!duplicadoId || !destinoId) return { ok: false, reason: 'INVALID', message: 'Escolha o cadastro definitivo.' };
  if (duplicadoId === destinoId) return { ok: false, reason: 'INVALID', message: 'O cadastro definitivo precisa ser outro.' };

  const [dup, dest] = await Promise.all([
    prisma.freelancer.findUnique({ where: { id: duplicadoId }, include: { units: true, sectorRates: true, _count: { select: { requests: true } } } }),
    prisma.freelancer.findUnique({ where: { id: destinoId }, include: { units: true, sectorRates: true } }),
  ]);
  if (!dup || !dest) return { ok: false, reason: 'INVALID', message: 'Cadastro não encontrado.' };
  if (dup.cpf && dest.cpf && dup.cpf !== dest.cpf) {
    return { ok: false, reason: 'CONFLICT', message: `Os dois cadastros têm CPF diferente (${dup.cpf} × ${dest.cpf}) — não parecem a mesma pessoa. Confira antes de mesclar.` };
  }

  const unidadesNovas = dup.units.map((u) => u.unitId).filter((id) => !dest.units.some((d) => d.unitId === id));
  const setoresNovos = dup.sectorRates.filter((r) => !dest.sectorRates.some((d) => d.sectorName === r.sectorName));
  const cpfDoDuplicado = dup.cpf && !dest.cpf ? dup.cpf : null;
  const pixDoDuplicado = dup.pixKey && !dest.pixKey ? dup.pixKey : null;

  const solicitacoes = await prisma.$transaction(async (tx) => {
    const movidas = await tx.paymentRequest.updateMany({ where: { freelancerId: dup.id }, data: { freelancerId: dest.id } });
    if (unidadesNovas.length) await tx.freelancerUnit.createMany({ data: unidadesNovas.map((unitId) => ({ freelancerId: dest.id, unitId })), skipDuplicates: true });
    if (setoresNovos.length) await tx.freelancerSectorRate.createMany({ data: setoresNovos.map((r) => ({ freelancerId: dest.id, sectorName: r.sectorName, dayValue: r.dayValue })) });
    /* O CPF é único: tira do duplicado antes de pôr no definitivo. */
    if (cpfDoDuplicado) await tx.freelancer.update({ where: { id: dup.id }, data: { cpf: null } });
    if (cpfDoDuplicado || pixDoDuplicado) {
      await tx.freelancer.update({ where: { id: dest.id }, data: { ...(cpfDoDuplicado ? { cpf: cpfDoDuplicado } : {}), ...(pixDoDuplicado ? { pixKey: pixDoDuplicado } : {}) } });
    }
    await tx.freelancer.delete({ where: { id: dup.id } });
    return movidas.count;
  });

  await audit({
    userId: user.id, action: 'FREELANCER_MERGE', module: 'CONFIG', entity: 'freelancer', entityId: dest.id,
    metadata: {
      duplicado: { id: dup.id, nome: dup.name, cpf: dup.cpf, solicitacoesAntes: dup._count.requests },
      definitivo: { id: dest.id, nome: dest.name, cpf: dest.cpf ?? cpfDoDuplicado },
      solicitacoesTransferidas: solicitacoes, unidadesSomadas: unidadesNovas.length, setoresCopiados: setoresNovos.length,
      cpfPreenchido: Boolean(cpfDoDuplicado), pixPreenchido: Boolean(pixDoDuplicado),
    },
    ...ctx,
  });
  return { ok: true, id: dest.id, solicitacoes, unidadesSomadas: unidadesNovas.length, setoresCopiados: setoresNovos.length };
}
