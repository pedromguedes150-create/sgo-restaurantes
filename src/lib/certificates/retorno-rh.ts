import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyUsers, notifyUnitRole, notifyAdmins } from '@/lib/notifications';
import { efeitoNaEscala, rotuloDoDocumento } from '@/lib/certificates/catalogo';
import { validarRetornoDoRh, ehRepeticao, mensagemParaOGerente, SITUACOES_SEM_EFEITO_NA_ESCALA } from '@/lib/certificates/retorno-rh-regras';
import type { Prisma } from '@prisma/client';

/**
 * RETORNO DO RH — o lado servidor (v1.197.0). Recebe o evento `atestado-situacao`
 * (já autenticado pela rota), aplica a situação ao documento, guarda a linha do
 * tempo, avisa o gerente e, no "não aceito", tira a marcação da Escala
 * (decisão do Daniel: a Escala marca no envio e o não aceite desfaz).
 */
export type ResultadoDoRetorno = { httpStatus: number; body: Record<string, unknown> };

async function log(payload: unknown, status: 'PROCESSED' | 'RECEIVED' | 'ERROR', message?: string) {
  await prisma.rhInboundEvent.create({
    data: { event: 'atestado_situacao', payload: (payload ?? {}) as Prisma.InputJsonValue, status, message: message ?? null },
  }).catch(() => {});
}

/** Dias marcados pelo documento saem da Escala (o mesmo que a exclusão pelo Admin faz). */
export async function desfazerMarcacaoNaEscala(c: { collaboratorId: string; startDate: string; endDate: string; type: 'FULL_DAY' | 'HOURS' | 'COMPANION'; nomenclature: string | null }) {
  const efeito = efeitoNaEscala(c);
  if (!efeito) return 0;
  const [ys, ms, ds] = c.startDate.split('-').map(Number);
  const [ye, me, de] = c.endDate.split('-').map(Number);
  const r = await prisma.scheduleActual.deleteMany({
    where: { collaboratorId: c.collaboratorId, status: efeito, date: { gte: new Date(Date.UTC(ys, ms - 1, ds)), lte: new Date(Date.UTC(ye, me - 1, de, 23, 59, 59)) } },
  });
  return r.count;
}

export async function handleAtestadoSituacao(payload: Record<string, unknown>): Promise<ResultadoDoRetorno> {
  const v = validarRetornoDoRh(payload);
  if (!v.ok) {
    await log(payload, 'ERROR', v.erro);
    return { httpStatus: 400, body: { error: v.erro } };
  }
  const r = v.dados;

  /* Casa pelo id do SGO; se o RH só tiver o id dele, tenta por rhAtestadoId. */
  const cert = await prisma.medicalCertificate.findFirst({
    where: { OR: [{ id: r.sgoMovimentoId }, ...(r.rhAtestadoId ? [{ rhAtestadoId: r.rhAtestadoId }] : [])] },
    include: { collaborator: { select: { name: true } }, createdBy: { select: { id: true, active: true } } },
  });
  if (!cert) {
    await log(payload, 'ERROR', `Documento ${r.sgoMovimentoId} não encontrado no SGO`);
    return { httpStatus: 404, body: { error: 'Documento não encontrado no SGO', sgoMovimentoId: r.sgoMovimentoId } };
  }

  if (ehRepeticao(cert, r)) {
    await log(payload, 'PROCESSED', `Repetição: ${cert.id} já estava ${r.status}`);
    return { httpStatus: 200, body: { status: 'processado', repetido: true, sgoMovimentoId: cert.id, situacao: cert.status } };
  }

  const de = cert.status;
  const reclassificou = r.nomenclatura && r.nomenclatura.nome !== cert.nomenclature;
  await prisma.$transaction([
    prisma.medicalCertificate.update({
      where: { id: cert.id },
      data: {
        status: r.status,
        statusNote: r.observacao,
        statusMotivo: r.motivo,
        statusAt: new Date(),
        ...(r.rhAtestadoId ? { rhAtestadoId: r.rhAtestadoId } : {}),
        ...(reclassificou && r.nomenclatura ? { nomenclature: r.nomenclatura.nome, documentGroup: r.nomenclatura.grupo, type: r.nomenclatura.tipo } : {}),
      },
    }),
    prisma.medicalCertificateEvent.create({
      data: {
        certificateId: cert.id, kind: 'SITUACAO', fromStatus: de, toStatus: r.status, motivo: r.motivo,
        note: [r.observacao, reclassificou && r.nomenclatura ? `Reclassificado pelo RH: ${cert.nomenclature ?? '—'} → ${r.nomenclatura.nome}` : null, r.nomenclaturaDesconhecida ? `RH classificou como "${r.nomenclaturaDesconhecida}" (nome fora do catálogo; não aplicado)` : null].filter(Boolean).join(' · ') || null,
        origem: 'RH', actorName: 'GBF-RH',
      },
    }),
  ]);

  /* Não aceito: o documento deixa de valer para a Escala. Como a grade DERIVA do
     documento (e passa a ignorar NAO_ACEITO), aqui só se limpa o que foi gravado. */
  let diasDesmarcados = 0;
  if (SITUACOES_SEM_EFEITO_NA_ESCALA.includes(r.status)) {
    diasDesmarcados = await desfazerMarcacaoNaEscala(cert).catch(() => 0);
  } else if (SITUACOES_SEM_EFEITO_NA_ESCALA.includes(de) && efeitoNaEscala(cert)) {
    /* Voltou a valer (RH mudou de ideia): a grade volta a derivar sozinha; nada a gravar. */
  }

  await audit({ userId: null, unitId: cert.unitId, action: 'CERTIFICATE_RH_RETURN', module: 'PEOPLE', entity: 'medical_certificate', entityId: cert.id, metadata: { de, para: r.status, motivo: r.motivo, reclassificou: Boolean(reclassificou), diasDesmarcados } });

  /* Aviso ao gerente que lançou (ou aos gerentes da unidade, se ele saiu). */
  const msg = mensagemParaOGerente(r, cert.collaborator.name, rotuloDoDocumento({ nomenclature: r.nomenclatura?.nome ?? cert.nomenclature, type: cert.type }));
  const aviso = { title: msg.title, body: msg.body, link: `/modulos/atestados?aba=historico&doc=${cert.id}`, module: 'PEOPLE', ...(msg.importante ? { nivel: 'IMPORTANTE' as const } : {}) };
  if (cert.createdBy?.active) await notifyUsers([cert.createdBy.id], aviso).catch(() => {});
  else await notifyUnitRole(cert.unitId, 'MANAGER', aviso).catch(() => {});
  if (r.situacao === 'nao_aceito') await notifyAdmins({ ...aviso, title: `${aviso.title} (${cert.collaborator.name})` }).catch(() => {});

  await log(payload, 'PROCESSED', `${cert.collaborator.name}: ${de} → ${r.status}${reclassificou ? ' (reclassificado)' : ''}`);
  return { httpStatus: 200, body: { status: 'processado', sgoMovimentoId: cert.id, situacao: r.status, ...(diasDesmarcados ? { diasDesmarcadosNaEscala: diasDesmarcados } : {}) } };
}
