import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createCertificate } from '@/lib/certificates/save';
import { handleAtestadoSituacao } from '@/lib/certificates/retorno-rh';
import { corrigirDocumento } from '@/lib/certificates/corrigir';
import { listCertificates } from '@/lib/certificates/query';
import { getScheduleGrid } from '@/lib/schedule';
import type { SessionUser } from '@/lib/auth/session';

/**
 * ETAPA B (v1.197.0): a decisão do RH volta pelo evento `atestado-situacao`, o
 * gerente é avisado, corrige e reenvia no MESMO registro, e o "não aceito" tira
 * o documento da Escala. Casos 13, 14 e 16 da spec.
 */
const sfx = `rb${process.pid.toString(36)}`;
let unitId: string; let gerenteId: string; let tipoId: string;
let joao = ''; let ana = '';
const ANO = 2026; const MES = 12;
const gerente = (): SessionUser => ({ id: gerenteId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const DOC = 'uploads/teste/documento-b.jpg';
const dia = (rows: Awaited<ReturnType<typeof getScheduleGrid>>['rows'], id: string, d: number) => rows.find((r) => r.collaboratorId === id)!.days[d - 1].actual;

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `RB-${sfx}`, name: `U Retorno ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Ger', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId } } } })).id;
  tipoId = (await prisma.scheduleTemplate.create({ data: { name: `6x1 RB ${sfx}`, workDays: 6, offDays: 1, startTime: '08:00', endTime: '16:00' } })).id;
  joao = (await prisma.collaborator.create({ data: { name: `JOAO RB ${sfx}`, jobTitle: 'Cozinha', cpf: '98765432100', units: { create: { unitId } } } })).id;
  ana = (await prisma.collaborator.create({ data: { name: `ANA RB ${sfx}`, jobTitle: 'Salão', units: { create: { unitId } } } })).id;
  for (const c of [joao, ana]) {
    await prisma.employeeSchedule.create({ data: { collaboratorId: c, unitId, templateId: tipoId, scheduleType: 'SIX_ONE', anchorDate: new Date(Date.UTC(2026, 11, 1)), startDate: new Date(Date.UTC(2026, 11, 1)), offMode: 'FIXED_WEEKLY', weeklyOffDay: 0 } });
  }
});

afterAll(async () => {
  await prisma.rhOutboundEvent.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.rhInboundEvent.deleteMany({ where: { event: 'atestado_situacao', createdAt: { gte: new Date(Date.now() - 600_000) } } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: gerenteId } }).catch(() => {});
  await prisma.medicalCertificate.deleteMany({ where: { collaboratorId: { in: [joao, ana] } } }).catch(() => {});
  await prisma.rhScheduleNotice.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: { in: [joao, ana] } } }).catch(() => {});
  await prisma.employeeSchedule.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [joao, ana] } } }).catch(() => {});
  await prisma.scheduleTemplate.delete({ where: { id: tipoId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: gerenteId } }).catch(() => {});
  await prisma.$disconnect();
});

let docId = '';

describe('retorno do RH → situação, aviso e Escala', () => {
  it('validado: a situação muda, a linha do tempo registra e o gerente que lançou recebe o aviso', async () => {
    const c = await createCertificate(gerente(), { unitId, collaboratorId: joao, nomenclatura: 'Atestado médico', startDate: '2026-12-02', endDate: '2026-12-04', attachmentPath: DOC });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    docId = c.id;
    const r = await handleAtestadoSituacao({ sgoMovimentoId: docId, situacao: 'validado', rhAtestadoId: 'rh-123' });
    expect(r.httpStatus).toBe(200);
    const row = await prisma.medicalCertificate.findUnique({ where: { id: docId }, include: { events: true } });
    expect(row?.status).toBe('VALIDADO_RH');
    expect(row?.rhAtestadoId).toBe('rh-123');
    expect(row?.events.map((e) => e.kind)).toEqual(['SITUACAO']);
    const aviso = await prisma.notification.findFirst({ where: { userId: gerenteId, title: 'RH: documento validado' } });
    expect(aviso?.link).toBe(`/modulos/atestados?aba=historico&doc=${docId}`);
  });

  it('caso 13: correção solicitada guarda motivo e observação, avisa o gerente como IMPORTANTE, e a lista expõe o motivo com rótulo', async () => {
    const r = await handleAtestadoSituacao({ sgoMovimentoId: docId, situacao: 'correcao_solicitada', motivo: 'foto_cortada', observacao: 'Envie o documento inteiro.' });
    expect(r.httpStatus).toBe(200);
    const row = await prisma.medicalCertificate.findUnique({ where: { id: docId } });
    expect(row?.status).toBe('CORRECAO_SOLICITADA');
    expect(row?.statusMotivo).toBe('foto_cortada');
    expect(row?.statusNote).toBe('Envie o documento inteiro.');
    const aviso = await prisma.notification.findFirst({ where: { userId: gerenteId, title: { contains: 'pediu correção' } } });
    expect(aviso?.level).toBe('IMPORTANTE');
    expect(aviso?.body).toContain('Foto cortada');
    const l = (await listCertificates(gerente(), { unitId })).find((x) => x.id === docId)!;
    expect(l.statusMotivoLabel).toBe('Foto cortada');
    expect(l.eventos.length).toBe(2);
  });

  it('caso 16: o mesmo evento de novo é repetição — 200, nada muda, nenhum aviso a mais', async () => {
    const antes = await prisma.notification.count({ where: { userId: gerenteId } });
    const r = await handleAtestadoSituacao({ sgoMovimentoId: docId, situacao: 'correcao_solicitada', motivo: 'foto_cortada', observacao: 'Envie o documento inteiro.' });
    expect(r.httpStatus).toBe(200);
    expect(r.body.repetido).toBe(true);
    expect(await prisma.notification.count({ where: { userId: gerenteId } })).toBe(antes);
    expect(await prisma.medicalCertificateEvent.count({ where: { certificateId: docId } })).toBe(2);
  });

  it('observação com CID é recusada (400) e fica registrada como erro na recepção; documento desconhecido dá 404', async () => {
    const r = await handleAtestadoSituacao({ sgoMovimentoId: docId, situacao: 'nao_aceito', motivo: 'outro', observacao: 'J11 não confere' });
    expect(r.httpStatus).toBe(400);
    expect(String(r.body.error)).toMatch(/CID/);
    const log = await prisma.rhInboundEvent.findFirst({ where: { event: 'atestado_situacao', status: 'ERROR' }, orderBy: { createdAt: 'desc' } });
    expect(log?.message).toMatch(/CID/);
    expect((await handleAtestadoSituacao({ sgoMovimentoId: 'nao-existe', situacao: 'validado' })).httpStatus).toBe(404);
  });

  it('caso 14: o gerente corrige NO MESMO registro — novo arquivo vira versão, período muda, situação "Corrigido e reenviado", RH recebe um atualizar', async () => {
    // o criar precisa estar ENVIADO para o atualizar sair
    await prisma.rhOutboundEvent.updateMany({ where: { tipo: 'ATESTADO', referenceId: docId, acao: 'criar' }, data: { status: 'ENVIADO' } });
    const r = await corrigirDocumento(gerente(), docId, { attachmentPath: 'uploads/teste/documento-b-v2.jpg', startDate: '2026-12-02', endDate: '2026-12-05' });
    expect(r).toMatchObject({ ok: true, status: 'CORRIGIDO_REENVIADO', reenviadoAoRh: true, reenvio: 'ENFILEIRADO' });
    const row = await prisma.medicalCertificate.findUnique({ where: { id: docId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    expect(row?.status).toBe('CORRIGIDO_REENVIADO');
    expect(row?.attachmentPath).toBe('uploads/teste/documento-b-v2.jpg');
    expect(row?.endDate).toBe('2026-12-05');
    expect(row?.days).toBe(4);
    const versao = row?.events.find((e) => e.kind === 'ANEXO');
    expect(versao?.attachmentPath).toBe(DOC); // a versão anterior ficou guardada
    expect(row?.events.some((e) => e.kind === 'CORRECAO')).toBe(true);
    const atualizar = await prisma.rhOutboundEvent.findFirst({ where: { tipo: 'ATESTADO', referenceId: docId, acao: 'atualizar' } });
    expect(atualizar?.status).toBe('PENDENTE');
    expect((atualizar?.payload as { sgoMovimentoId: string }).sgoMovimentoId).toBe(docId);
    expect(atualizar?.anexoPath).toBe('uploads/teste/documento-b-v2.jpg');
    // a Escala acompanha o período corrigido (2→5)
    const g = await getScheduleGrid(unitId, ANO, MES);
    expect([2, 3, 4, 5].map((d) => dia(g.rows, joao, d)).every((s) => s === 'ATESTADO')).toBe(true);
    expect(dia(g.rows, joao, 6)).toBeNull();
  });

  it('corrigir fora de "Correção solicitada" é ESTADO; sem mudar nada é NADA_MUDOU; outro gerente sem a unidade é FORBIDDEN', async () => {
    expect((await corrigirDocumento(gerente(), docId, { startDate: '2026-12-02', endDate: '2026-12-06' })).ok).toBe(false);
    expect((await corrigirDocumento(gerente(), docId, {})).ok).toBe(false);
    await handleAtestadoSituacao({ sgoMovimentoId: docId, situacao: 'correcao_solicitada', motivo: 'outro', observacao: 'Confira a data.' });
    expect(await corrigirDocumento(gerente(), docId, {})).toEqual({ ok: false, reason: 'NADA_MUDOU' });
    const outro: SessionUser = { id: gerenteId, name: 'Outro', role: 'MANAGER', unitIds: ['outra-unidade'], seesAllUnits: false, needsTerms: false };
    expect(await corrigirDocumento(outro, docId, { startDate: '2026-12-03', endDate: '2026-12-05' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('não aceito: o documento DEIXA de marcar a Escala (grade e banco), e volta a marcar se o RH validar depois', async () => {
    const c = await createCertificate(gerente(), { unitId, collaboratorId: ana, nomenclatura: 'Licença-casamento', startDate: '2026-12-10', endDate: '2026-12-12', attachmentPath: DOC });
    if (!c.ok) throw new Error('não criou');
    let g = await getScheduleGrid(unitId, ANO, MES);
    expect(dia(g.rows, ana, 11)).toBe('LICENCA');
    const r = await handleAtestadoSituacao({ sgoMovimentoId: c.id, situacao: 'nao_aceito', motivo: 'colaborador_incorreto', observacao: 'A certidão é de outra pessoa.' });
    expect(r.httpStatus).toBe(200);
    expect(r.body.diasDesmarcadosNaEscala).toBe(3);
    g = await getScheduleGrid(unitId, ANO, MES);
    expect(dia(g.rows, ana, 11)).toBeNull();
    expect(await prisma.scheduleActual.count({ where: { collaboratorId: ana, status: 'LICENCA' } })).toBe(0);
    // RH mudou de ideia: validado → a grade volta a derivar do documento
    await handleAtestadoSituacao({ sgoMovimentoId: c.id, situacao: 'validado' });
    g = await getScheduleGrid(unitId, ANO, MES);
    expect(dia(g.rows, ana, 11)).toBe('LICENCA');
  });

  it('reclassificação pelo RH: nome do catálogo é aplicado (grupo e tipo acompanham); nome fora do catálogo fica só na linha do tempo', async () => {
    const c = await createCertificate(gerente(), { unitId, collaboratorId: ana, startDate: '2026-12-20', endDate: '2026-12-20', attachmentPath: DOC });
    if (!c.ok) throw new Error('não criou');
    expect(c.status).toBe('CLASSIFICACAO_PENDENTE');
    await handleAtestadoSituacao({ sgoMovimentoId: c.id, situacao: 'validado', nomenclaturaRh: 'Doação voluntária de sangue' });
    let row = await prisma.medicalCertificate.findUnique({ where: { id: c.id }, include: { events: true } });
    expect(row?.nomenclature).toBe('Doação voluntária de sangue');
    expect(row?.documentGroup).toBe('COMPARECIMENTO');
    expect(row?.events[0].note).toContain('Reclassificado pelo RH');
    await handleAtestadoSituacao({ sgoMovimentoId: c.id, situacao: 'concluido', nomenclaturaRh: 'Documento esquisito' });
    row = await prisma.medicalCertificate.findUnique({ where: { id: c.id }, include: { events: { orderBy: { createdAt: 'desc' } } } });
    expect(row?.nomenclature).toBe('Doação voluntária de sangue'); // não mudou
    expect(row?.events[0].note).toContain('fora do catálogo');
    expect(row?.status).toBe('CONCLUIDO');
  });
});
