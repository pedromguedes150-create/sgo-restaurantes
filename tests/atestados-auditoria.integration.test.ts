import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { createCertificate } from '@/lib/certificates/save';
import { getAuditoriaDeAtestados, getCertificatesCoverage, informarAtestadoEsperado, justificarEsperado, revisarEsperado } from '@/lib/certificates/auditoria';
import { componentesDaMeta } from '@/lib/metas/componentes';

/**
 * AUDITORIA DE ATESTADOS (v1.181.0) contra o banco: informar, cruzar com o
 * lançamento (nos dois sentidos), justificar, decidir, e o componente da meta
 * (neutro, em conferência não conta, falha confirmada conta).
 *
 * Os esperados vivem num mês PASSADO (2 meses atrás): o prazo já venceu e
 * nenhum teste do mês corrente é afetado.
 */
const sfx = `aud${process.pid.toString(36)}`;
let unitId = ''; let outraUnit = ''; let colabA = ''; let colabB = ''; let colabC = '';
let gerente: SessionUser; let supervisor: SessionUser; let outroGerente: SessionUser;
const ym = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1)).toISOString().slice(0, 7); })();
const dia = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
/* ciência numa quarta-feira às 10h (Brasília) do mês: 24 horas úteis vencem no dia seguinte às 10h */
const ciencia = new Date(`${ym}-04T13:00:00Z`);

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `AUD-${sfx}`, name: `Auditoria ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnit = (await prisma.unit.create({ data: { code: `AUD-O-${sfx}`, name: `Outra ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  const g = await prisma.user.create({ data: { name: `Ger ${sfx}`, email: `g-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId } } } });
  const s = await prisma.user.create({ data: { name: `Sup ${sfx}`, email: `s-${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x', memberships: { create: [{ unitId }, { unitId: outraUnit }] } } });
  const og = await prisma.user.create({ data: { name: `Ger outra ${sfx}`, email: `og-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId: outraUnit } } } });
  gerente = { id: g.id, name: g.name, role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false };
  supervisor = { id: s.id, name: s.name, role: 'SUPERVISOR', unitIds: [unitId, outraUnit], seesAllUnits: false, needsTerms: false };
  outroGerente = { id: og.id, name: og.name, role: 'MANAGER', unitIds: [outraUnit], seesAllUnits: false, needsTerms: false };
  for (const [k, n] of [['A', 'colabA'], ['B', 'colabB'], ['C', 'colabC']] as const) {
    const c = await prisma.collaborator.create({ data: { name: `Colab ${k} ${sfx}`, active: true, units: { create: { unitId } } } });
    if (n === 'colabA') colabA = c.id; else if (n === 'colabB') colabB = c.id; else colabC = c.id;
  }
});
afterAll(async () => {
  await prisma.certificateExpectation.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } });
  await prisma.scheduleActual.deleteMany({ where: { unitId } });
  await prisma.rhOutboundEvent.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.medicalCertificate.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerente.id, supervisor.id, outroGerente.id] } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: [colabA, colabB, colabC] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerente.id, supervisor.id, outroGerente.id] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnit] } } });
});

describe('informar e cruzar', () => {
  it('o gerente não informa; o supervisor informa; duplicidade por colaborador + período é recusada', async () => {
    expect(await informarAtestadoEsperado(gerente, { unitId, collaboratorId: colabA, startDate: dia(4), endDate: dia(5), noticeAt: ciencia.toISOString() })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    const r = await informarAtestadoEsperado(supervisor, { unitId, collaboratorId: colabA, startDate: dia(4), endDate: dia(5), noticeAt: ciencia.toISOString(), receivedByName: 'Caixa da manhã' });
    expect(r.ok).toBe(true);
    expect(await informarAtestadoEsperado(supervisor, { unitId, collaboratorId: colabA, startDate: dia(5), endDate: dia(6), noticeAt: ciencia.toISOString() })).toMatchObject({ ok: false, reason: 'DUPLICATE' });
    expect(await informarAtestadoEsperado(supervisor, { unitId, collaboratorId: colabA, startDate: dia(9), endDate: dia(8), noticeAt: ciencia.toISOString() })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await informarAtestadoEsperado(outroGerente, { unitId, collaboratorId: colabA, startDate: dia(20), endDate: dia(20), noticeAt: ciencia.toISOString() })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
  });

  it('atestado LANÇADO depois cruza sozinho com o esperado (período sobreposto) e, lançado fora do prazo, fica EM CONFERÊNCIA — sem prejudicar a nota', async () => {
    const c = await createCertificate(gerente, { unitId, collaboratorId: colabA, startDate: dia(4), endDate: dia(5) });
    expect(c.ok).toBe(true);
    const a = await getAuditoriaDeAtestados(supervisor, ym, unitId);
    const e = a.esperados.find((x) => x.collaboratorId === colabA)!;
    expect(e.lancamento?.id).toBe((c as { id: string }).id);
    expect(e.lancamento?.atraso).toBe(true); // lançado hoje, prazo venceu há dois meses
    expect(e.situacao).toBe('EM_CONFERENCIA');
    expect(e.receivedByName).toBe('Caixa da manhã');
    expect(a.rede.pct).toBeNull(); // nada decidido = neutro
    const cov = await getCertificatesCoverage(unitId, ym);
    expect(cov).toMatchObject({ done: 0, missed: 0, pct: null });
  });

  it('esperado informado DEPOIS do lançamento cruza na hora: lançamento dentro do prazo = CONFORME', async () => {
    /* o atestado existe antes do esperado; a ciência é informada como AGORA, então o lançamento (feito antes) está dentro do prazo */
    const c = await createCertificate(gerente, { unitId, collaboratorId: colabB, startDate: dia(10), endDate: dia(12) });
    expect(c.ok).toBe(true);
    const r = await informarAtestadoEsperado(supervisor, { unitId, collaboratorId: colabB, startDate: dia(11), endDate: dia(11), noticeAt: new Date().toISOString() });
    expect(r.ok).toBe(true);
    const a = await getAuditoriaDeAtestados(supervisor, ym, unitId);
    const e = a.esperados.find((x) => x.collaboratorId === colabB)!;
    expect(e.lancamento?.id).toBe((c as { id: string }).id);
    expect(e.situacao).toBe('CONFORME');
    expect(a.rede).toMatchObject({ conformes: 1, emConferencia: 1, base: 1, pct: 100, pontos: 100, penalizacao: 0 });
  });
});

describe('justificar e decidir', () => {
  let pendenteId = '';
  it('esperado sem lançamento com prazo vencido fica EM CONFERÊNCIA; o gerente justifica (curto é recusado)', async () => {
    const r = await informarAtestadoEsperado(supervisor, { unitId, collaboratorId: colabC, startDate: dia(15), endDate: dia(16), noticeAt: ciencia.toISOString() });
    expect(r.ok).toBe(true);
    pendenteId = (r as { id: string }).id;
    const a = await getAuditoriaDeAtestados(supervisor, ym, unitId);
    expect(a.esperados.find((x) => x.id === pendenteId)!.situacao).toBe('EM_CONFERENCIA');
    expect(await justificarEsperado(gerente, pendenteId, 'curto')).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await justificarEsperado(outroGerente, pendenteId, 'não é da minha unidade, mas tento')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await justificarEsperado(gerente, pendenteId, 'O colaborador entregou o atestado só na semana seguinte.')).toMatchObject({ ok: true });
  });
  it('a supervisão aprova a justificativa → JUSTIFICADO conta como conforme; reabre; confirma a falha com responsável validado', async () => {
    expect(await revisarEsperado(gerente, pendenteId, { decisao: 'JUSTIFICADO' })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await revisarEsperado(supervisor, pendenteId, { decisao: 'JUSTIFICADO' })).toMatchObject({ ok: true });
    let a = await getAuditoriaDeAtestados(supervisor, ym, unitId);
    expect(a.esperados.find((x) => x.id === pendenteId)!.situacao).toBe('JUSTIFICADO');
    expect(a.rede).toMatchObject({ conformes: 1, justificados: 1, falhas: 0, pct: 100 });

    expect(await revisarEsperado(supervisor, pendenteId, { decisao: 'REABRIR' })).toMatchObject({ ok: true });
    /* responsável de OUTRA unidade é recusado; o gerente da unidade é aceito e a responsabilidade nasce validada */
    expect(await revisarEsperado(supervisor, pendenteId, { decisao: 'FALHA', responsibleUserId: outroGerente.id })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await revisarEsperado(supervisor, pendenteId, { decisao: 'FALHA', responsibleUserId: gerente.id, nota: 'Atestado ficou na gaveta' })).toMatchObject({ ok: true });
    a = await getAuditoriaDeAtestados(supervisor, ym, unitId);
    const e = a.esperados.find((x) => x.id === pendenteId)!;
    expect(e).toMatchObject({ situacao: 'FALHA_CONFIRMADA', responsibleUserId: gerente.id, responsibleName: gerente.name });
    expect(e.responsibilityValidatedAt).not.toBeNull();
    /* coletivo: 1 conforme, 1 falha → 50% → faixa abaixo de 80 → perde 50% do peso */
    expect(a.rede).toMatchObject({ conformes: 1, falhas: 1, emConferencia: 1, base: 2, pct: 50, penalizacao: 50, pontos: 50 });
    /* individual: só a falha VALIDADA aparece no gerente; quem lançou os dois atestados também é ele */
    const g = a.porGerente.find((x) => x.userId === gerente.id)!;
    expect(g).toMatchObject({ falhasConfirmadas: 1, lancamentos: 2, lancamentosNoPrazo: 1 });
  });
  it('a falha não pode ser confirmada em esperado lançado no prazo; invalidar exige motivo e tira da conta', async () => {
    const a = await getAuditoriaDeAtestados(supervisor, ym, unitId);
    const conforme = a.esperados.find((x) => x.collaboratorId === colabB)!;
    expect(await revisarEsperado(supervisor, conforme.id, { decisao: 'FALHA' })).toMatchObject({ ok: false, reason: 'ESTADO' });
    const emConf = a.esperados.find((x) => x.collaboratorId === colabA)!;
    expect(await revisarEsperado(supervisor, emConf.id, { decisao: 'INVALIDO' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await revisarEsperado(supervisor, emConf.id, { decisao: 'INVALIDO', nota: 'O RH informou o período errado' })).toMatchObject({ ok: true });
    const depois = await getAuditoriaDeAtestados(supervisor, ym, unitId);
    expect(depois.rede).toMatchObject({ invalidos: 1, emConferencia: 0, base: 2, pct: 50 });
  });
  it('o componente da META lê a mesma conformidade: 1 conforme / 1 falha → 50 pontos de 100, em Monitoramento por padrão', async () => {
    const cov = await getCertificatesCoverage(unitId, ym);
    expect(cov).toMatchObject({ done: 1, missed: 1, scorePct: 50, pct: 50, penalizacao: 50 });
    const comps = await componentesDaMeta(unitId, ym);
    const cert = comps.find((c) => c.key === 'CERTIFICATES')!;
    expect(cert).toMatchObject({ done: 1, missed: 1, scorePct: 50 });
    expect(cert.name).toContain('conformidade 50%');
    expect(['MONITORAMENTO', 'HOMOLOGACAO', 'DESENVOLVIMENTO', 'ATIVO']).toContain(cert.status);
  });
  it('escopo: o gerente de outra unidade não vê estes esperados', async () => {
    const a = await getAuditoriaDeAtestados(outroGerente, ym);
    expect(a.esperados.some((e) => e.unitId === unitId)).toBe(false);
  });
});
