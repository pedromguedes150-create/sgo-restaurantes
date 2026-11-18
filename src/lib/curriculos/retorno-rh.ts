import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyUsers, notifyUnitRole } from '@/lib/notifications';
import type { Prisma } from '@prisma/client';
import { ehRepeticao, mensagemParaOGerente, validarRetornoDoRh } from '@/lib/curriculos/regras';

/**
 * RETORNO DO RH SOBRE UM CURRÍCULO (v1.212.0) — evento `curriculo-situacao`,
 * pela MESMA porta e com o MESMO token de entrada dos atestados
 * (`/api/integracoes/rh/[evento]`, já autenticado pela rota).
 *
 * É o ÚNICO caminho que muda a situação de um currículo. Guarda a linha do
 * tempo, marca a sincronização e avisa o gerente que encaminhou.
 */
export type ResultadoDoRetorno = { httpStatus: number; body: Record<string, unknown> };

async function log(payload: unknown, status: 'PROCESSED' | 'ERROR', message?: string) {
  /* O corpo deste evento só traz ids, situação e a observação do RH — nome e telefone do candidato não passam por aqui. */
  await prisma.rhInboundEvent.create({
    data: { event: 'curriculo_situacao', payload: (payload ?? {}) as Prisma.InputJsonValue, status, message: message ?? null },
  }).catch(() => {});
}

export async function handleCurriculoSituacao(payload: Record<string, unknown>): Promise<ResultadoDoRetorno> {
  const v = validarRetornoDoRh(payload);
  if (!v.ok) {
    await log(payload, 'ERROR', v.erro);
    return { httpStatus: 400, body: { error: v.erro } };
  }
  const r = v.dados;

  /* Casa pelo id do SGO; sem ele, pelo id que o RH já tinha informado antes. */
  const c = r.sgoCurriculoId
    ? await prisma.candidateResume.findUnique({ where: { id: r.sgoCurriculoId } })
    : await prisma.candidateResume.findFirst({ where: { rhCandidateId: r.rhCandidatoId! }, orderBy: { createdAt: 'desc' } });
  if (!c) {
    await log(payload, 'ERROR', `Currículo ${r.sgoCurriculoId ?? r.rhCandidatoId} não encontrado no SGO`);
    return { httpStatus: 404, body: { error: 'Currículo não encontrado no SGO', sgoCurriculoId: r.sgoCurriculoId, rhCandidatoId: r.rhCandidatoId } };
  }

  const agora = new Date();
  if (ehRepeticao(c, r)) {
    await prisma.candidateResume.update({ where: { id: c.id }, data: { rhSyncedAt: agora, ...(r.rhCandidatoId && !c.rhCandidateId ? { rhCandidateId: r.rhCandidatoId } : {}) } });
    await log(payload, 'PROCESSED', `Repetição: ${c.id} já estava ${r.status}`);
    return { httpStatus: 200, body: { status: 'processado', repetido: true, sgoCurriculoId: c.id, situacao: r.situacao } };
  }

  const de = c.status;
  await prisma.$transaction([
    prisma.candidateResume.update({
      where: { id: c.id },
      data: {
        status: r.status, statusNote: r.observacao, statusAt: agora, rhSyncedAt: agora,
        /* A data da entrevista vale enquanto a situação for a de entrevista ou o RH mandar outra. */
        interviewAt: r.entrevistaEm ?? (r.status === 'ENTREVISTA_AGENDADA' ? c.interviewAt : null),
        ...(r.rhCandidatoId ? { rhCandidateId: r.rhCandidatoId } : {}),
      },
    }),
    prisma.candidateResumeEvent.create({
      data: {
        resumeId: c.id, kind: 'SITUACAO', fromStatus: de, toStatus: r.status, origem: 'RH', actorName: 'GBF-RH',
        note: [r.observacao, r.entrevistaEm ? `Entrevista: ${r.entrevistaEm.toISOString()}` : null].filter(Boolean).join(' · ') || null,
      },
    }),
  ]);

  await audit({ userId: null, unitId: c.unitId, action: 'RESUME_RH_RETURN', module: 'PEOPLE', entity: 'candidate_resume', entityId: c.id, metadata: { de, para: r.status } });

  const msg = mensagemParaOGerente(c.candidateName, r);
  const aviso = { title: msg.title, body: msg.body, link: `/modulos/curriculos?abrir=${c.id}`, module: 'PEOPLE', ...(msg.importante ? { nivel: 'IMPORTANTE' as const } : {}) };
  const autor = c.createdById ? await prisma.user.findUnique({ where: { id: c.createdById }, select: { id: true, active: true } }) : null;
  if (autor?.active) await notifyUsers([autor.id], aviso).catch(() => {});
  else await notifyUnitRole(c.unitId, 'MANAGER', aviso).catch(() => {});

  await log(payload, 'PROCESSED', `${c.id}: ${de} → ${r.status}`);
  return { httpStatus: 200, body: { status: 'processado', sgoCurriculoId: c.id, situacao: r.situacao } };
}
