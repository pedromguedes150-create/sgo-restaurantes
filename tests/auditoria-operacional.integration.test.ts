import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { createNote } from '@/lib/notes/create';
import { createGasReceipt } from '@/lib/gas/create';
import { createOilCollection } from '@/lib/oil/create';
import { countLateEntries } from '@/lib/late-entry';
import { componentesDaMeta } from '@/lib/metas/componentes';
import {
  desvincularOcorrencia, getAuditoriaOperacional, getOperationalAuditCoverage, informarOcorrencia, justificarOcorrencia, revisarOcorrencia, vincularOcorrencia,
} from '@/lib/auditoria-operacional/auditoria';

/**
 * AUDITORIA OPERACIONAL (v1.184.0) contra o banco: informar, cruzar com o
 * lançamento (nos dois sentidos e o caso ambíguo), vincular à mão, justificar,
 * decidir, o componente da meta por módulo e o "Fora do prazo" sem duplicidade.
 *
 * As ocorrências vivem num mês PASSADO (2 meses atrás): o prazo já venceu e
 * nenhum teste do mês corrente é afetado.
 */
const sfx = `opa${process.pid.toString(36)}`;
let unitId = ''; let outraUnit = '';
let gerente: SessionUser; let supervisor: SessionUser; let outroGerente: SessionUser;
const ym = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1)).toISOString().slice(0, 7); })();
const dia = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
/* ciência no dia 4 do mês às 10h (Brasília): 24 horas úteis venceram há dois meses */
const ciencia = new Date(`${ym}-04T13:00:00Z`);

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `OPA-${sfx}`, name: `Auditoria op ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnit = (await prisma.unit.create({ data: { code: `OPA-O-${sfx}`, name: `Outra op ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  const g = await prisma.user.create({ data: { name: `Ger ${sfx}`, email: `g-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId } } } });
  const s = await prisma.user.create({ data: { name: `Sup ${sfx}`, email: `s-${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x', memberships: { create: [{ unitId }, { unitId: outraUnit }] } } });
  const og = await prisma.user.create({ data: { name: `Ger outra ${sfx}`, email: `og-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId: outraUnit } } } });
  gerente = { id: g.id, name: g.name, role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false };
  supervisor = { id: s.id, name: s.name, role: 'SUPERVISOR', unitIds: [unitId, outraUnit], seesAllUnits: false, needsTerms: false };
  outroGerente = { id: og.id, name: og.name, role: 'MANAGER', unitIds: [outraUnit], seesAllUnits: false, needsTerms: false };
});
afterAll(async () => {
  await prisma.operationalExpectation.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } });
  await prisma.receivedNote.deleteMany({ where: { unitId } });
  await prisma.gasReceipt.deleteMany({ where: { unitId } });
  await prisma.oilCollection.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerente.id, supervisor.id, outroGerente.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerente.id, supervisor.id, outroGerente.id] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnit] } } });
});

const auditoria = (u: SessionUser, modulo: string, unit?: string) => getAuditoriaOperacional(u, ym, { modulo, unitId: unit });

describe('informar e cruzar', () => {
  it('o gerente não informa; a supervisão informa; duplicidade por módulo + unidade + data + referência; módulo desconhecido', async () => {
    const base = { modulo: 'NOTES', unitId, reference: `Distribuidora ${sfx} nº 123`, eventDate: dia(4), noticeAt: ciencia.toISOString() };
    expect(await informarOcorrencia(gerente, base)).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await informarOcorrencia(supervisor, { ...base, modulo: 'XPTO' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await informarOcorrencia(supervisor, { ...base, reference: 'ab' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await informarOcorrencia(supervisor, { ...base, expectedUserId: outroGerente.id })).toMatchObject({ ok: false, reason: 'INVALID' }); // gerente de OUTRA unidade
    const r = await informarOcorrencia(supervisor, { ...base, source: 'SUPPLIER', sourceDetail: 'o entregador ligou', expectedUserId: gerente.id });
    expect(r.ok).toBe(true);
    expect(await informarOcorrencia(supervisor, { ...base, reference: `  distribuidora ${sfx} Nº 123 ` })).toMatchObject({ ok: false, reason: 'DUPLICATE' });
    expect(await informarOcorrencia(outroGerente, base)).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    const a = await auditoria(supervisor, 'NOTES', unitId);
    expect(a.ocorrencias).toHaveLength(1);
    expect(a.ocorrencias[0]).toMatchObject({ situacao: 'EM_CONFERENCIA', lancamento: null, expectedUserName: gerente.name, source: 'SUPPLIER' });
    expect(a.rede.pct).toBeNull(); // nada decidido = neutro
  });

  it('a nota LANÇADA depois cruza sozinha (janela de ±3 dias) e, lançada fora do prazo, fica EM CONFERÊNCIA — sem prejudicar a nota', async () => {
    const n = await createNote(gerente, { unitId, supplierName: `Distribuidora ${sfx}`, number: '123', totalValue: 150, issueDate: dia(5) });
    expect(n.ok).toBe(true);
    const a = await auditoria(supervisor, 'NOTES', unitId);
    const e = a.ocorrencias[0];
    expect(e.lancamento?.id).toBe((n as { id: string }).id);
    expect(e.lancamento?.atraso).toBe(true);
    expect(e.situacao).toBe('EM_CONFERENCIA');
    expect(e.lancamento?.descricao).toContain('nº 123');
    expect(await getOperationalAuditCoverage('NOTES', unitId, ym)).toMatchObject({ done: 0, missed: 0, pct: null });
  });

  it('ocorrência informada DEPOIS do lançamento cruza na hora: lançado dentro do prazo = CONFORME e o componente dá 100', async () => {
    const g = await createGasReceipt(gerente, { unitId, quantityKg: 90, pricePerKg: 7, operationalDate: dia(10) });
    expect(g.ok).toBe(true);
    const r = await informarOcorrencia(supervisor, { modulo: 'GAS', unitId, reference: `Gás ${sfx} 90 kg`, eventDate: dia(11), noticeAt: new Date().toISOString() });
    expect(r.ok).toBe(true);
    const a = await auditoria(supervisor, 'GAS', unitId);
    expect(a.ocorrencias[0]).toMatchObject({ situacao: 'CONFORME' });
    expect(a.ocorrencias[0].lancamento?.id).toBe((g as { id: string }).id);
    expect(await getOperationalAuditCoverage('GAS', unitId, ym)).toMatchObject({ done: 1, missed: 0, pct: 100, scorePct: 100, penalizacao: 0 });
  });

  it('dois lançamentos na janela = AMBÍGUO: ninguém é vinculado sozinho; a supervisão vincula à mão, o mesmo lançamento não serve a duas ocorrências, e dá para desvincular', async () => {
    const o1 = await createOilCollection(gerente, { unitId, liters: 50, pricePerLiter: 2, operationalDate: dia(15), collectorName: `Coletora ${sfx}`, receiptPath: `uploads/${unitId}/oleo-${sfx}-1.jpg` });
    const o2 = await createOilCollection(gerente, { unitId, liters: 60, pricePerLiter: 2, operationalDate: dia(16), collectorName: `Coletora ${sfx}`, receiptPath: `uploads/${unitId}/oleo-${sfx}-2.jpg` });
    expect(o1.ok && o2.ok).toBe(true);
    const r = await informarOcorrencia(supervisor, { modulo: 'OIL', unitId, reference: `Coleta ${sfx} 50 L`, eventDate: dia(15), noticeAt: new Date().toISOString() });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    let a = await auditoria(supervisor, 'OIL', unitId);
    expect(a.ocorrencias[0].lancamento).toBeNull();
    expect(a.ocorrencias[0].candidatos.map((c) => c.id).sort()).toEqual([(o1 as { id: string }).id, (o2 as { id: string }).id].sort());
    expect(await vincularOcorrencia(gerente, id, (o1 as { id: string }).id)).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await vincularOcorrencia(supervisor, id, (o1 as { id: string }).id)).toMatchObject({ ok: true });
    a = await auditoria(supervisor, 'OIL', unitId);
    expect(a.ocorrencias[0]).toMatchObject({ situacao: 'CONFORME' });
    expect(a.ocorrencias[0].lancamento?.id).toBe((o1 as { id: string }).id);
    /* segunda ocorrência tentando o MESMO lançamento */
    const r2 = await informarOcorrencia(supervisor, { modulo: 'OIL', unitId, reference: `Coleta ${sfx} outra`, eventDate: dia(16), noticeAt: new Date().toISOString() });
    expect(r2.ok).toBe(true); // cruzou com o o2 (o o1 já estava preso)
    expect(await vincularOcorrencia(supervisor, (r2 as { id: string }).id, (o1 as { id: string }).id)).toMatchObject({ ok: false, reason: 'DUPLICATE' });
    expect(await desvincularOcorrencia(supervisor, (r2 as { id: string }).id)).toMatchObject({ ok: true });
    a = await auditoria(supervisor, 'OIL', unitId);
    expect(a.ocorrencias.find((x) => x.id === (r2 as { id: string }).id)?.lancamento).toBeNull();
  });
});

describe('justificar, decidir e a meta', () => {
  it('a falha CONFIRMADA pela supervisão desconta X% do peso; justificativa aprovada volta a contar como conforme', async () => {
    const a0 = await auditoria(supervisor, 'NOTES', unitId);
    const e = a0.ocorrencias[0];
    expect(await revisarOcorrencia(gerente, e.id, { decisao: 'FALHA' })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await revisarOcorrencia(supervisor, e.id, { decisao: 'FALHA', responsibleUserId: outroGerente.id })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await revisarOcorrencia(supervisor, e.id, { decisao: 'FALHA', responsibleUserId: gerente.id, nota: 'lançou três dias depois' })).toMatchObject({ ok: true });
    let a = await auditoria(supervisor, 'NOTES', unitId);
    expect(a.ocorrencias[0]).toMatchObject({ situacao: 'FALHA_CONFIRMADA', responsibleName: gerente.name });
    expect(a.rede).toMatchObject({ falhas: 1, pct: 0, penalizacao: 10, pontos: 90 });
    expect(a.porGerente.find((g) => g.userId === gerente.id)?.falhasConfirmadas).toBe(1);
    expect(await getOperationalAuditCoverage('NOTES', unitId, ym)).toMatchObject({ done: 0, missed: 1, pct: 0, scorePct: 90, penalizacao: 10 });
    const comps = await componentesDaMeta(unitId, ym);
    const notas = comps.find((c) => c.key === 'NOTES_AUDIT')!;
    expect(notas).toMatchObject({ missed: 1, scorePct: 90, status: 'MONITORAMENTO' }); // linha-base da migração: fora da nota até o Admin ativar
    expect(notas.name).toContain('conformidade 0%');
    expect(comps.find((c) => c.key === 'GAS_AUDIT')).toMatchObject({ done: 1, scorePct: 100 });
    expect(comps.find((c) => c.key === 'PAYMENTS_AUDIT')).toMatchObject({ done: 0, missed: 0 }); // neutro

    /* o gerente justifica; a supervisão aprova → conforme */
    expect(await justificarOcorrencia(outroGerente, e.id, 'não é a minha unidade, mas tento')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await justificarOcorrencia(gerente, e.id, 'curto')).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await justificarOcorrencia(gerente, e.id, 'A nota chegou sem o boleto e o fornecedor só mandou depois.')).toMatchObject({ ok: true });
    expect(await revisarOcorrencia(supervisor, e.id, { decisao: 'JUSTIFICADO' })).toMatchObject({ ok: true });
    a = await auditoria(supervisor, 'NOTES', unitId);
    expect(a.ocorrencias[0].situacao).toBe('JUSTIFICADO');
    expect(a.rede).toMatchObject({ falhas: 0, justificados: 1, pct: 100, pontos: 100 });
    /* invalidar exige motivo; reabrir volta a conferência */
    expect(await revisarOcorrencia(supervisor, e.id, { decisao: 'INVALIDO', nota: 'x' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await revisarOcorrencia(supervisor, e.id, { decisao: 'REABRIR' })).toMatchObject({ ok: true });
    expect((await auditoria(supervisor, 'NOTES', unitId)).ocorrencias[0].situacao).toBe('EM_CONFERENCIA');
  });

  it('o lançamento auditado SAI do "Fora do prazo": a nota vinculada com data corrigida não desconta de novo; uma nota corrigida sem auditoria continua descontando', async () => {
    const vinculada = (await auditoria(supervisor, 'NOTES', unitId)).ocorrencias[0].lancamento!.id;
    await prisma.receivedNote.update({ where: { id: vinculada }, data: { dateEdited: true, entryDate: new Date(`${ym}-05T12:00:00Z`) } });
    expect(await countLateEntries(unitId, ym)).toBe(0);
    const solta = await createNote(gerente, { unitId, supplierName: `Solta ${sfx}`, totalValue: 80, issueDate: dia(25) });
    expect(solta.ok).toBe(true);
    await prisma.receivedNote.update({ where: { id: (solta as { id: string }).id }, data: { dateEdited: true, entryDate: new Date(`${ym}-25T12:00:00Z`) } });
    expect(await countLateEntries(unitId, ym)).toBe(1);
  });

  it('escopo: o gerente da outra unidade não vê nada; o filtro de unidade entra em AND com o escopo; o resumo traz os quatro módulos', async () => {
    expect((await auditoria(outroGerente, 'NOTES')).ocorrencias).toHaveLength(0);
    expect((await auditoria(supervisor, 'NOTES', outraUnit)).ocorrencias).toHaveLength(0);
    const a = await auditoria(gerente, 'OIL');
    expect(a.ocorrencias.length).toBe(2);
    expect(a.modulos.map((m) => m.modulo)).toEqual(['NOTES', 'GAS', 'OIL', 'PAYMENTS']);
    expect(a.modulos.find((m) => m.modulo === 'GAS')).toMatchObject({ esperados: 1, conformes: 1, prazoHoras: 24, pctPorFalha: 10 });
  });
});
