import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import { registerAbsence } from '@/lib/schedule';
import { enfileirarAtestado } from '@/lib/rh/saida/fila';
import { nomenclaturaPorNome, efeitoNaEscala, situacaoInicial, alertaDeDuracao, conferirNome, type Nomenclatura } from '@/lib/certificates/catalogo';
import { alertasDoDocumento, ROTULO_DO_ALERTA, type Alerta } from '@/lib/certificates/alertas';
import { carregarConfigDasNomenclaturas, diasDaRegraCom, hojeISO } from '@/lib/certificates/config-nomenclaturas';
import type { SessionUser } from '@/lib/auth/session';
import type { CertificateType } from '@prisma/client';

export interface CreateCertInput {
  unitId: string;
  collaboratorId: string;
  /** Tipo do contrato do RH. Com `nomenclatura` do catálogo, o tipo é o DELA (este é ignorado). */
  type?: CertificateType;
  /**
   * v1.196.0 — nomenclatura padronizada do catálogo ("Atestado médico",
   * "Licença-paternidade"…). Nome fora do catálogo é recusado (INVALID).
   * Ausente = classificação pendente de análise do RH.
   */
  nomenclatura?: string | null;
  issueDate?: string;
  startDate: string;
  endDate: string;
  hours?: number;
  doctorName?: string;
  doctorCrm?: string;
  cid?: string;
  cidDescription?: string;
  observation?: string;
  /** Obrigatório desde a v1.196.0: todo lançamento tem o documento. */
  attachmentPath?: string;
  aiExtracted?: unknown;
}
export type CreateCertResult =
  | { ok: true; id: string; days: number; status: string; alerta: 'INSS' | null; alertas: Alerta[] }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'DUPLICATE' | 'NO_LINK' | 'SEM_ANEXO' | 'NOMENCLATURA' };

type Ctx = { ip?: string | null; userAgent?: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function dayUTC(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
/** Dias de afastamento (inclusivo). */
export function daysBetween(start: string, end: string): number {
  return Math.floor((dayUTC(end).getTime() - dayUTC(start).getTime()) / 86_400_000) + 1;
}

/**
 * Registra um documento da Central de Atestados e Afins e, quando ele afasta
 * o dia, marca a Escala (Atestado / Afastado / Licença / Falta justificada,
 * conforme a nomenclatura). A validação é do RH, no sistema dele: aqui o
 * registro nasce "Leitura concluída" (ou "Classificação pendente") e vira
 * "Enviado ao RH" quando a fila confirma o aceite.
 */
export async function createCertificate(user: SessionUser, input: CreateCertInput, ctx: Ctx = {}): Promise<CreateCertResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (!input.collaboratorId) return { ok: false, reason: 'INVALID' };
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) return { ok: false, reason: 'INVALID' };
  if (dayUTC(input.endDate) < dayUTC(input.startDate)) return { ok: false, reason: 'INVALID' };
  if (input.issueDate && !DATE_RE.test(input.issueDate)) return { ok: false, reason: 'INVALID' };
  /* O documento é obrigatório (spec de 09/11/2026): sem foto/PDF o RH não tem o que validar. */
  if (!input.attachmentPath || !input.attachmentPath.trim()) return { ok: false, reason: 'SEM_ANEXO' };

  /* Nomenclatura: só do catálogo. Texto que não casa com nenhuma é recusado —
     não se grava classificação inventada; sem nomenclatura o registro fica
     "Classificação pendente" para o RH decidir. */
  let nomenclatura: Nomenclatura | null = null;
  if (input.nomenclatura && input.nomenclatura.trim()) {
    nomenclatura = nomenclaturaPorNome(input.nomenclatura);
    if (!nomenclatura) return { ok: false, reason: 'NOMENCLATURA' };
  }

  // Colaborador precisa estar vinculado a esta unidade (consistência das métricas)
  const link = await prisma.collaboratorUnit.findUnique({
    where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } },
    select: { id: true, collaborator: { select: { name: true } } },
  });
  if (!link) return { ok: false, reason: 'NO_LINK' };

  const type: CertificateType = nomenclatura?.tipo ?? input.type ?? 'FULL_DAY';
  const days = type === 'HOURS' ? 1 : daysBetween(input.startDate, input.endDate);
  const escala = efeitoNaEscala({ nomenclature: nomenclatura?.nome ?? null, type });

  // Anti-duplicidade: mesmo colaborador + início + fim já lançado
  const dup = await prisma.medicalCertificate.findFirst({
    where: { collaboratorId: input.collaboratorId, startDate: input.startDate, endDate: input.endDate },
    select: { id: true },
  });
  if (dup) return { ok: false, reason: 'DUPLICATE' };

  /* Divergência de nome (IA × colaborador escolhido) vai gravada junto com a
     leitura, para o RH ver — nunca barra o gerente. */
  const ai = (input.aiExtracted && typeof input.aiExtracted === 'object' ? { ...(input.aiExtracted as Record<string, unknown>) } : null);
  if (ai) {
    const campos = (ai.fields && typeof ai.fields === 'object' ? ai.fields : {}) as Record<string, unknown>;
    const nomeLido = typeof campos.collaboratorName === 'string' ? campos.collaboratorName : null;
    const conf = conferirNome(nomeLido, link.collaborator.name);
    if (conf) ai.conferenciaDoNome = { nomeLido, colaborador: link.collaborator.name, ...conf };
  }

  const status = situacaoInicial(nomenclatura);
  const rec = await prisma.medicalCertificate.create({
    data: {
      unitId: input.unitId,
      collaboratorId: input.collaboratorId,
      type,
      documentGroup: nomenclatura?.grupo ?? null,
      nomenclature: nomenclatura?.nome ?? null,
      status,
      statusAt: new Date(),
      issueDate: input.issueDate || null,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      hours: type === 'HOURS' && input.hours != null && input.hours > 0 ? input.hours : null,
      doctorName: input.doctorName?.trim() || null,
      doctorCrm: input.doctorCrm?.trim() || null,
      cid: input.cid?.trim() || null,
      cidDescription: input.cidDescription?.trim() || null,
      observation: input.observation?.trim() || null,
      attachmentPath: input.attachmentPath,
      aiExtracted: (ai as object) ?? undefined,
      createdById: user.id,
    },
    select: { id: true },
  });

  // Marca a Escala conforme a nomenclatura (null = declaração de horas: não afasta o dia).
  if (escala) {
    await registerAbsence(user, {
      collaboratorId: input.collaboratorId,
      unitId: input.unitId,
      status: escala,
      start: input.startDate,
      end: input.endDate,
      reason: nomenclatura?.nome ?? (type === 'COMPANION' ? 'Acompanhamento (atestado)' : 'Atestado médico'),
      attachmentPath: input.attachmentPath,
    }, ctx).catch(() => {}); // não bloqueia o lançamento se a Escala falhar
  }

  const alerta = alertaDeDuracao({ documentGroup: nomenclatura?.grupo ?? null, nomenclature: nomenclatura?.nome ?? null, type, days });

  /* v1.198.0 — inteligência de afastamentos: o documento contra o histórico do
     colaborador (intercalados em 60 dias, CAT, INSS, prazo ≠ regra, retorno).
     Só sinaliza; quem decide é o RH. */
  const [historico, cfg] = await Promise.all([
    prisma.medicalCertificate.findMany({ where: { collaboratorId: input.collaboratorId, id: { not: rec.id } }, select: { id: true, documentGroup: true, nomenclature: true, type: true, startDate: true, endDate: true, days: true, status: true } }),
    carregarConfigDasNomenclaturas().catch(() => new Map()),
  ]);
  const alertas = alertasDoDocumento(
    { id: rec.id, documentGroup: nomenclatura?.grupo ?? null, nomenclature: nomenclatura?.nome ?? null, type, startDate: input.startDate, endDate: input.endDate, days, status },
    historico, hojeISO(), diasDaRegraCom(cfg),
  );

  await audit({ userId: user.id, unitId: input.unitId, action: 'CERTIFICATE_CREATE', module: 'PEOPLE', entity: 'medical_certificate', entityId: rec.id, metadata: { type, grupo: nomenclatura?.grupo ?? null, nomenclatura: nomenclatura?.nome ?? null, status, days, start: input.startDate, end: input.endDate, alerta }, ...ctx });

  /* v1.181.0 — se o RH/supervisão já tinha informado este atestado como ESPERADO, o
     lançamento cruza com ele agora (colaborador + unidade + período). */
  const { cruzarAtestado } = await import('@/lib/certificates/auditoria');
  await cruzarAtestado(rec.id).catch((e) => console.error('[auditoria-atestados] falha ao cruzar:', e));

  /* Envio automático ao GBF-RH (v1.168.0): entra na FILA, não na rede — o
     documento fica gravado mesmo com o RH fora do ar ou sem token. */
  await enfileirarAtestado(rec.id, 'criar', user.id).catch((e) => console.error('[rh-saida] falha ao enfileirar atestado:', e));

  // Avisa o RH (Admins) — eles controlam no sistema próprio e mandam à contabilidade
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } });
  const rotulo = nomenclatura?.nome ?? 'documento (classificação pendente)';
  await notifyAdmins({
    title: alerta === 'INSS' ? 'Documento registrado — análise INSS necessária' : 'Novo documento registrado',
    body: `${user.name} lançou ${rotulo} de ${link.collaborator.name} (${type === 'HOURS' ? 'horas' : `${days} dia(s)`}) em ${unit?.name ?? ''}.${alerta === 'INSS' ? ' Mais de 15 dias: avaliar encaminhamento ao INSS.' : ''}`,
    link: `/modulos/atestados?aba=historico`,
    module: 'PEOPLE',
  });

  /* Alertas que pedem ação do RH (além do INSS, que já vai no aviso principal). */
  const paraORh = alertas.filter((a) => a.tipo !== 'INSS_15' && a.tipo !== 'RETORNO' && a.gravidade !== 'info');
  if (paraORh.length) {
    await notifyAdmins({
      title: `Documento com alerta: ${paraORh.map((a) => ROTULO_DO_ALERTA[a.tipo]).join(' · ')}`,
      body: `${link.collaborator.name} — ${rotulo}. ${paraORh.map((a) => a.texto).join(' ')}`,
      link: `/modulos/atestados?aba=historico&doc=${rec.id}`,
      module: 'PEOPLE', nivel: 'IMPORTANTE',
    }).catch(() => {});
  }

  return { ok: true, id: rec.id, days, status, alerta, alertas };
}
