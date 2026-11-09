import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import { registerAbsence } from '@/lib/schedule';
import { ENDPOINTS, mascararCpfsNoTexto } from '@/lib/rh/saida/regras';
import { montarAtestado } from '@/lib/rh/saida/montagem';
import { efeitoNaEscala, conferirNome } from '@/lib/certificates/catalogo';
import { podeCorrigir } from '@/lib/certificates/retorno-rh-regras';
import { desfazerMarcacaoNaEscala } from '@/lib/certificates/retorno-rh';
import { daysBetween } from '@/lib/certificates/save';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

/**
 * CORREÇÃO PELO GERENTE (v1.197.0): o RH pediu correção → o gerente troca a
 * foto/PDF, as datas ou o colaborador NO MESMO registro (nunca um lançamento
 * novo), o anexo anterior fica guardado como versão, a situação vira
 * "Corrigido e reenviado" e o RH recebe um `atualizar` com o MESMO
 * sgoMovimentoId e um sgoEventId novo.
 */
export interface CorrecaoInput {
  attachmentPath?: string;
  startDate?: string;
  endDate?: string;
  collaboratorId?: string;
  observation?: string;
  aiExtracted?: unknown;
}
/**
 * O que aconteceu com o reenvio ao RH:
 *  - ENFILEIRADO: `atualizar` na fila (o `criar` já tinha sido aceito);
 *  - PENDENTE_DO_CRIAR: o `criar` ainda não chegou ao RH — ele levará o registro já corrigido;
 *  - ERRO_DE_DADOS: falta dado do contrato (CPF) — o evento nasce ERRO para o Admin revisar em Envios ao RH.
 */
export type ReenvioAoRh = 'ENFILEIRADO' | 'PENDENTE_DO_CRIAR' | 'ERRO_DE_DADOS';
export type ResultadoDaCorrecao =
  | { ok: true; id: string; status: 'CORRIGIDO_REENVIADO'; reenviadoAoRh: boolean; reenvio: ReenvioAoRh }
  | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'ESTADO' | 'INVALID' | 'NO_LINK' | 'NADA_MUDOU' };

type Ctx = { ip?: string | null; userAgent?: string | null };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PODE_CORRIGIR_PERFIL = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO'];

export async function corrigirDocumento(user: SessionUser, certId: string, input: CorrecaoInput, ctx: Ctx = {}): Promise<ResultadoDaCorrecao> {
  if (!PODE_CORRIGIR_PERFIL.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const cert = await prisma.medicalCertificate.findUnique({ where: { id: certId }, include: { collaborator: { select: { name: true } } } });
  if (!cert) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, cert.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!podeCorrigir(cert.status)) return { ok: false, reason: 'ESTADO' };

  const novoAnexo = input.attachmentPath?.trim() || null;
  const novoInicio = input.startDate?.trim() || null;
  const novoFim = input.endDate?.trim() || null;
  const novoColab = input.collaboratorId?.trim() || null;
  if (novoInicio && !DATE_RE.test(novoInicio)) return { ok: false, reason: 'INVALID' };
  if (novoFim && !DATE_RE.test(novoFim)) return { ok: false, reason: 'INVALID' };
  const start = novoInicio ?? cert.startDate;
  const end = cert.type === 'HOURS' ? start : (novoFim ?? (novoInicio ? novoInicio : cert.endDate));
  if (end < start) return { ok: false, reason: 'INVALID' };
  const mudouAnexo = Boolean(novoAnexo && novoAnexo !== cert.attachmentPath);
  const mudouPeriodo = start !== cert.startDate || end !== cert.endDate;
  const mudouColab = Boolean(novoColab && novoColab !== cert.collaboratorId);
  const mudouObs = input.observation !== undefined && (input.observation?.trim() || null) !== cert.observation;
  if (!mudouAnexo && !mudouPeriodo && !mudouColab && !mudouObs) return { ok: false, reason: 'NADA_MUDOU' };

  let nomeColab = cert.collaborator.name;
  if (mudouColab && novoColab) {
    const link = await prisma.collaboratorUnit.findUnique({ where: { collaboratorId_unitId: { collaboratorId: novoColab, unitId: cert.unitId } }, select: { collaborator: { select: { name: true } } } });
    if (!link) return { ok: false, reason: 'NO_LINK' };
    nomeColab = link.collaborator.name;
  }

  /* A leitura nova (se houve) leva a conferência do nome, como no lançamento. */
  const ai = input.aiExtracted && typeof input.aiExtracted === 'object' ? { ...(input.aiExtracted as Record<string, unknown>) } : null;
  if (ai) {
    const campos = (ai.fields && typeof ai.fields === 'object' ? ai.fields : {}) as Record<string, unknown>;
    const nomeLido = typeof campos.collaboratorName === 'string' ? campos.collaboratorName : null;
    const conf = conferirNome(nomeLido, nomeColab);
    if (conf) ai.conferenciaDoNome = { nomeLido, colaborador: nomeColab, ...conf };
  }

  /* Escala: tira o que o registro antigo marcou e marca de novo com os dados corrigidos. */
  if (mudouPeriodo || mudouColab) await desfazerMarcacaoNaEscala(cert).catch(() => {});

  const days = cert.type === 'HOURS' ? 1 : daysBetween(start, end);
  const de = cert.status;
  await prisma.$transaction([
    prisma.medicalCertificate.update({
      where: { id: cert.id },
      data: {
        status: 'CORRIGIDO_REENVIADO', statusAt: new Date(),
        ...(mudouAnexo && novoAnexo ? { attachmentPath: novoAnexo } : {}),
        ...(mudouPeriodo ? { startDate: start, endDate: end, days } : {}),
        ...(mudouColab && novoColab ? { collaboratorId: novoColab } : {}),
        ...(mudouObs ? { observation: input.observation?.trim() || null } : {}),
        ...(ai ? { aiExtracted: ai as Prisma.InputJsonValue } : {}),
      },
    }),
    /* Versão anterior do anexo: guardada ANTES de o caminho mudar. */
    ...(mudouAnexo && cert.attachmentPath ? [prisma.medicalCertificateEvent.create({
      data: { certificateId: cert.id, kind: 'ANEXO', attachmentPath: cert.attachmentPath, note: 'Versão anterior do documento, substituída na correção', origem: 'GERENTE', actorId: user.id, actorName: user.name },
    })] : []),
    prisma.medicalCertificateEvent.create({
      data: {
        certificateId: cert.id, kind: 'CORRECAO', fromStatus: de, toStatus: 'CORRIGIDO_REENVIADO', motivo: cert.statusMotivo,
        note: [mudouAnexo ? 'novo arquivo' : null, mudouPeriodo ? `período ${cert.startDate}→${cert.endDate} para ${start}→${end}` : null, mudouColab ? `colaborador ${cert.collaborator.name} → ${nomeColab}` : null, mudouObs ? 'observação' : null].filter(Boolean).join(' · ') || null,
        attachmentPath: mudouAnexo ? novoAnexo : null, origem: 'GERENTE', actorId: user.id, actorName: user.name,
      },
    }),
  ]);

  const efeito = efeitoNaEscala(cert);
  if (efeito && (mudouPeriodo || mudouColab)) {
    await registerAbsence(user, { collaboratorId: novoColab ?? cert.collaboratorId, unitId: cert.unitId, status: efeito, start, end, reason: cert.nomenclature ?? 'Atestado médico', attachmentPath: novoAnexo ?? cert.attachmentPath ?? undefined }, ctx).catch(() => {});
  }

  /* RH: `atualizar` com o mesmo sgoMovimentoId e sgoEventId novo — só se o `criar`
     já chegou lá; senão o `criar` pendente levará o registro já corrigido. */
  let reenvio: ReenvioAoRh = 'PENDENTE_DO_CRIAR';
  const criar = await prisma.rhOutboundEvent.findFirst({ where: { tipo: 'ATESTADO', referenceId: cert.id, acao: 'criar' }, orderBy: { createdAt: 'desc' } });
  if (criar?.status === 'ENVIADO') {
    const m = await montarAtestado(cert.id, 'atualizar');
    if (m.ok) {
      await prisma.rhOutboundEvent.create({
        data: { tipo: 'ATESTADO', acao: 'atualizar', referenceId: cert.id, endpoint: ENDPOINTS.ATESTADO, payload: m.payload as Prisma.InputJsonValue, anexoPath: m.anexoPath, unitId: m.unitId, createdById: user.id, proximaTentativaEm: new Date() },
      });
      reenvio = 'ENFILEIRADO';
    } else {
      /* Mesmo desenho da fila: falta dado do contrato → ERRO permanente com o que falta, visível em Envios ao RH. */
      await prisma.rhOutboundEvent.create({
        data: { tipo: 'ATESTADO', acao: 'atualizar', referenceId: cert.id, endpoint: ENDPOINTS.ATESTADO, payload: {}, status: 'ERRO', ultimoErro: mascararCpfsNoTexto(m.erro), unitId: m.unitId, createdById: user.id },
      });
      reenvio = 'ERRO_DE_DADOS';
    }
  }
  const reenviadoAoRh = reenvio === 'ENFILEIRADO';

  await audit({ userId: user.id, unitId: cert.unitId, action: 'CERTIFICATE_CORRECTED', module: 'PEOPLE', entity: 'medical_certificate', entityId: cert.id, metadata: { de, mudouAnexo, mudouPeriodo, mudouColab, mudouObs, reenvio }, ...ctx });
  await notifyAdmins({
    title: 'Documento corrigido e reenviado',
    body: `${user.name} corrigiu o documento de ${nomeColab}${reenvio === 'ENFILEIRADO' ? ' — o RH recebe a atualização.' : reenvio === 'ERRO_DE_DADOS' ? ' — o reenvio ao RH ficou com erro de dados (confira Envios ao RH).' : '.'}`,
    link: reenvio === 'ERRO_DE_DADOS' ? '/configuracoes/integracoes/envios-rh' : `/modulos/atestados?aba=historico&doc=${cert.id}`, module: 'PEOPLE',
  }).catch(() => {});

  return { ok: true, id: cert.id, status: 'CORRIGIDO_REENVIADO', reenviadoAoRh, reenvio };
}
