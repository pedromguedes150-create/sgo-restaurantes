import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createCertificate } from '@/lib/certificates/save';
import { listCertificates, getCertificatesReport } from '@/lib/certificates/query';
import { getScheduleGrid, fillActualFromPlan } from '@/lib/schedule';
import { deleteMedicalCertificate } from '@/lib/admin-ops';
import { payloadAtestado } from '@/lib/rh/saida/regras';
import type { SessionUser } from '@/lib/auth/session';

/**
 * CENTRAL DE ATESTADOS E AFINS (v1.196.0) — o lançamento por nomenclatura e o
 * que ele produz: grupo/situação gravados, a Escala marcando LI/AF/FJ/A
 * conforme o documento, anexo obrigatório, e o aceite do RH movendo a situação.
 */
const sfx = `af${process.pid.toString(36)}`;
let unitId: string; let userId: string; let tipoId: string;
let joao = ''; let ana = '';
const ANO = 2026; const MES = 11;
const admin = (): SessionUser => ({ id: userId, name: 'Adm', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const DOC = 'uploads/teste/documento.jpg';
const dias = (rows: Awaited<ReturnType<typeof getScheduleGrid>>['rows'], id: string, de: number, ate: number) => {
  const row = rows.find((r) => r.collaboratorId === id)!;
  return Array.from({ length: ate - de + 1 }, (_, i) => row.days[de - 1 + i].actual);
};

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `AF-${sfx}`, name: `U Afins ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Adm', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  tipoId = (await prisma.scheduleTemplate.create({ data: { name: `6x1 AF ${sfx}`, workDays: 6, offDays: 1, startTime: '08:00', endTime: '16:00' } })).id;
  joao = (await prisma.collaborator.create({ data: { name: `JOAO PEDRO ${sfx}`, jobTitle: 'Cozinha', cpf: '12345678901', units: { create: { unitId } } } })).id;
  ana = (await prisma.collaborator.create({ data: { name: `ANA LUCIA ${sfx}`, jobTitle: 'Salão', units: { create: { unitId } } } })).id;
  for (const c of [joao, ana]) {
    await prisma.employeeSchedule.create({
      data: { collaboratorId: c, unitId, templateId: tipoId, scheduleType: 'SIX_ONE', anchorDate: new Date(Date.UTC(2026, 10, 1)), startDate: new Date(Date.UTC(2026, 10, 1)), offMode: 'FIXED_WEEKLY', weeklyOffDay: 0 },
    });
  }
});

afterAll(async () => {
  await prisma.rhOutboundEvent.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { link: { contains: '/modulos/atestados' }, createdAt: { gte: new Date(Date.now() - 600_000) } } }).catch(() => {});
  await prisma.medicalCertificate.deleteMany({ where: { collaboratorId: { in: [joao, ana] } } }).catch(() => {});
  await prisma.rhScheduleNotice.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: { in: [joao, ana] } } }).catch(() => {});
  await prisma.employeeSchedule.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [joao, ana] } } }).catch(() => {});
  await prisma.scheduleTemplate.delete({ where: { id: tipoId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('lançamento por nomenclatura', () => {
  it('o documento é OBRIGATÓRIO: sem anexo recusa com SEM_ANEXO', async () => {
    const r = await createCertificate(gerente(), { unitId, collaboratorId: joao, nomenclatura: 'Atestado médico', startDate: '2026-11-03', endDate: '2026-11-05' });
    expect(r).toEqual({ ok: false, reason: 'SEM_ANEXO' });
  });

  it('nomenclatura fora do catálogo é recusada (NOMENCLATURA) — nada é gravado com classificação inventada', async () => {
    const r = await createCertificate(gerente(), { unitId, collaboratorId: joao, nomenclatura: 'Declaração de frequência escolar', startDate: '2026-11-03', endDate: '2026-11-03', attachmentPath: DOC });
    expect(r).toEqual({ ok: false, reason: 'NOMENCLATURA' });
  });

  it('caso 5: Licença-paternidade grava grupo LICENCA, situação "Leitura concluída" e marca LI na Escala só nos dias do período', async () => {
    const r = await createCertificate(gerente(), {
      unitId, collaboratorId: joao, nomenclatura: 'licença-paternidade', startDate: '2026-11-03', endDate: '2026-11-07', attachmentPath: DOC,
      aiExtracted: { nomenclatura: 'Licença-paternidade', fields: { collaboratorName: `JOAO PEDRO ${sfx}` } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('LEITURA_CONCLUIDA');
    expect(r.days).toBe(5);
    const row = await prisma.medicalCertificate.findUnique({ where: { id: r.id } });
    expect(row?.documentGroup).toBe('LICENCA');
    expect(row?.nomenclature).toBe('Licença-paternidade');
    expect(row?.type).toBe('FULL_DAY');
    expect((row?.aiExtracted as { conferenciaDoNome?: { divergente: boolean } })?.conferenciaDoNome?.divergente).toBe(false);
    const g = await getScheduleGrid(unitId, ANO, MES);
    expect(dias(g.rows, joao, 3, 7)).toEqual(['LICENCA', 'LICENCA', 'LICENCA', 'LICENCA', 'LICENCA']);
    expect(dias(g.rows, joao, 2, 2)).toEqual([null]);
    expect(dias(g.rows, joao, 8, 8)).toEqual([null]);
    // a fila do RH leva a nomenclatura no texto livre do contrato (não há campo próprio)
    const ev = await prisma.rhOutboundEvent.findFirst({ where: { tipo: 'ATESTADO', referenceId: r.id, acao: 'criar' } });
    expect((ev?.payload as { observacoes?: string })?.observacoes).toBe('[Licença-paternidade]');
    expect((ev?.payload as { tipoDetalhe?: string })?.tipoDetalhe).toBe('FULL_DAY');
  });

  it('"Puxar Realizado = Planejado" não pisa na licença; excluir o documento tira o LI (e só ele)', async () => {
    const f = await fillActualFromPlan(admin(), { unitId, year: ANO, month: MES, mode: 'all' });
    expect(f.ok).toBe(true);
    let g = await getScheduleGrid(unitId, ANO, MES);
    expect(dias(g.rows, joao, 3, 7).every((s) => s === 'LICENCA')).toBe(true);
    expect(dias(g.rows, joao, 10, 10)).toEqual(['WORK']);
    const doc = await prisma.medicalCertificate.findFirst({ where: { collaboratorId: joao, nomenclature: 'Licença-paternidade' }, select: { id: true } });
    const d = await deleteMedicalCertificate(admin(), doc!.id);
    expect(d.ok).toBe(true);
    g = await getScheduleGrid(unitId, ANO, MES);
    expect(dias(g.rows, joao, 3, 7).some((s) => s === 'LICENCA')).toBe(false);
    expect(dias(g.rows, joao, 10, 10)).toEqual(['WORK']);
  });

  it('caso 4: declaração de consulta de 2 horas não afasta o dia; caso 7: alistamento eleitoral marca Falta justificada; INSS marca Afastado', async () => {
    const c = await createCertificate(gerente(), { unitId, collaboratorId: ana, nomenclatura: 'Consulta médica', startDate: '2026-11-12', endDate: '2026-11-12', hours: 2, attachmentPath: DOC });
    expect(c.ok).toBe(true);
    const e = await createCertificate(gerente(), { unitId, collaboratorId: ana, nomenclatura: 'Alistamento eleitoral', startDate: '2026-11-18', endDate: '2026-11-18', attachmentPath: DOC });
    expect(e.ok).toBe(true);
    const i = await createCertificate(gerente(), { unitId, collaboratorId: ana, nomenclatura: 'Afastamento pelo INSS', startDate: '2026-11-20', endDate: '2026-11-25', attachmentPath: DOC });
    expect(i.ok).toBe(true);
    const g = await getScheduleGrid(unitId, ANO, MES);
    expect(dias(g.rows, ana, 12, 12)).toEqual(['WORK']); // o fill anterior pôs T; a consulta não altera
    expect(dias(g.rows, ana, 18, 18)).toEqual(['FALTA_JUST']);
    expect(dias(g.rows, ana, 20, 25).every((s) => s === 'AFASTADO')).toBe(true);
    const row = await prisma.medicalCertificate.findUnique({ where: { id: (c as { id: string }).id } });
    expect(row?.type).toBe('HOURS');
    expect(Number(row?.hours)).toBe(2);
    expect(row?.documentGroup).toBe('COMPARECIMENTO');
  });

  it('caso 1 e 2: dois atestados sucessivos (3 e 16 dias) são a mesma nomenclatura; o de 16 volta com alerta INSS e aviso próprio', async () => {
    const tres = await createCertificate(gerente(), { unitId, collaboratorId: joao, nomenclatura: 'Atestado médico', startDate: '2026-11-10', endDate: '2026-11-12', attachmentPath: DOC });
    const dezesseis = await createCertificate(gerente(), { unitId, collaboratorId: joao, nomenclatura: 'Atestado médico', startDate: '2026-11-13', endDate: '2026-11-28', attachmentPath: DOC });
    expect(tres.ok && dezesseis.ok).toBe(true);
    if (!tres.ok || !dezesseis.ok) return;
    expect(tres.alerta).toBeNull();
    expect(dezesseis.alerta).toBe('INSS');
    expect(dezesseis.days).toBe(16);
    const lista = await listCertificates(admin(), { unitId });
    const l16 = lista.find((x) => x.id === dezesseis.id)!;
    const l3 = lista.find((x) => x.id === tres.id)!;
    expect(l16.rotulo).toBe(l3.rotulo);
    expect(l16.alerta).toBe('INSS');
    expect(l3.alerta).toBeNull();
    const aviso = await prisma.notification.findFirst({ where: { title: { contains: 'análise INSS' }, createdAt: { gte: new Date(Date.now() - 60_000) } } });
    expect(aviso).not.toBeNull();
    expect(aviso?.body ?? '').not.toMatch(/CID/);
  });

  it('caso 11: documento de OUTRA pessoa — o nome lido destoa do colaborador: grava a divergência e a lista a aponta (não bloqueia)', async () => {
    const r = await createCertificate(gerente(), {
      unitId, collaboratorId: ana, nomenclatura: 'Atestado odontológico', startDate: '2026-11-26', endDate: '2026-11-26', attachmentPath: DOC,
      aiExtracted: { nomenclatura: 'Atestado odontológico', fields: { collaboratorName: 'CARLOS EDUARDO MOREIRA' } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const l = (await listCertificates(admin(), { unitId })).find((x) => x.id === r.id)!;
    expect(l.nomeDivergente).toBe(true);
  });

  it('caso 12/18: sem nomenclatura segura o registro nasce "Classificação pendente" e segue para o RH mesmo assim', async () => {
    const r = await createCertificate(gerente(), { unitId, collaboratorId: ana, startDate: '2026-11-27', endDate: '2026-11-27', attachmentPath: DOC, aiExtracted: { nomenclatura: null, naturezaLida: 'Comprovante de matrícula' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('CLASSIFICACAO_PENDENTE');
    const ev = await prisma.rhOutboundEvent.findFirst({ where: { tipo: 'ATESTADO', referenceId: r.id, acao: 'criar' } });
    expect(ev).not.toBeNull();
    const row = await prisma.medicalCertificate.findUnique({ where: { id: r.id } });
    expect(row?.documentGroup).toBeNull();
    expect(row?.nomenclature).toBeNull();
  });

  it('o aceite do RH ("Enviado") move a situação para ENVIADO_RH — e só enquanto o RH ainda não se manifestou', async () => {
    const row = await prisma.medicalCertificate.findFirst({ where: { collaboratorId: ana, nomenclature: 'Alistamento eleitoral' }, select: { id: true } });
    // simula o que o despachante faz ao receber 2xx (mesma regra, sem rede)
    const { SITUACOES_ANTES_DO_RH } = await import('@/lib/certificates/catalogo');
    await prisma.medicalCertificate.updateMany({ where: { id: row!.id, status: { in: [...SITUACOES_ANTES_DO_RH] } }, data: { status: 'ENVIADO_RH', statusAt: new Date() } });
    expect((await prisma.medicalCertificate.findUnique({ where: { id: row!.id } }))?.status).toBe('ENVIADO_RH');
    // RH já pediu correção: um reenvio aceito não volta a "Enviado"
    await prisma.medicalCertificate.update({ where: { id: row!.id }, data: { status: 'CORRECAO_SOLICITADA' } });
    const n = await prisma.medicalCertificate.updateMany({ where: { id: row!.id, status: { in: [...SITUACOES_ANTES_DO_RH] } }, data: { status: 'ENVIADO_RH' } });
    expect(n.count).toBe(0);
    await prisma.medicalCertificate.update({ where: { id: row!.id }, data: { status: 'ENVIADO_RH' } });
  });

  it('o painel agrupa por grupo, por nomenclatura e por situação; os registros antigos (sem nomenclatura) entram pelo tipo de sempre', async () => {
    const rep = await getCertificatesReport(admin(), '2026-11');
    const grupos = Object.fromEntries(rep.byGroup.map((g) => [g.grupo, g.count]));
    expect(grupos.ATESTADO).toBeGreaterThanOrEqual(3); // 3 dias + 16 dias + odontológico (+ o pendente, que cai em ATESTADO pelo tipo)
    expect(grupos.COMPARECIMENTO).toBeGreaterThanOrEqual(2);
    expect(grupos.AFASTAMENTO).toBe(1);
    expect(rep.byNomenclature.find((n) => n.rotulo === 'Atestado médico')?.count).toBe(2);
    expect(rep.byNomenclature.find((n) => n.rotulo === 'Atestado (dias de afastamento)')?.count).toBe(1); // o pendente, sem nomenclatura
    expect(rep.byStatus.some((s) => s.status === 'ENVIADO_RH')).toBe(true);
    expect(rep.byStatus.some((s) => s.status === 'CLASSIFICACAO_PENDENTE')).toBe(true);
  });

  it('contrato do RH intocado: sem nomenclatura o corpo é o de sempre (observações puras); com ela, o prefixo [Nome]', () => {
    const base = { id: 'x', cpf: '12345678901', type: 'COMPANION' as const, startDate: '2026-10-01', endDate: '2026-10-02' };
    expect(payloadAtestado({ ...base, observation: 'consulta do filho' }, 'criar')).toMatchObject({ tipoDetalhe: 'COMPANION', motivo: 'ACOMPANHANTE', observacoes: 'consulta do filho' });
    expect(payloadAtestado({ ...base, nomenclature: 'Acompanhante de familiar', observation: 'consulta do filho' }, 'criar').observacoes).toBe('[Acompanhante de familiar] consulta do filho');
    expect(payloadAtestado({ ...base }, 'criar').observacoes).toBeUndefined();
  });
});
