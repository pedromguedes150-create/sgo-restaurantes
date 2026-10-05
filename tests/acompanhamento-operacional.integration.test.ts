import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  atualizarAcaoPelaUnidade, criarAcao, finalizarVisita, getIndicadoresOperacionais, getVisitaOperacional, iniciarVisita, listarAcoesDoAlcance, responderItem, validarAcao,
} from '@/lib/supervisor/operacional';
import { completeVisit } from '@/lib/supervisor/visits';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Acompanhamento operacional (v1.155.0) com banco: iniciar → responder →
 * ação → finalizar (resultado congelado) → a unidade informa → a próxima visita
 * valida → reincidência. Escopo por unidade e "a conferência não altera a
 * operação" travados aqui.
 */
const sfx = `ao${process.pid.toString(36)}`;
let unitA: string, unitB: string, supId: string, gerId: string, outroSupId: string;
const supervisor = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const gerente = (): SessionUser => ({ id: gerId, name: 'Ger', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const outroSup = (): SessionUser => ({ id: outroSupId, name: 'Outro', role: 'SUPERVISOR', unitIds: [unitB], seesAllUnits: false, needsTerms: false });
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let visita1: string;

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `A-${sfx}`, name: `AO A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, operationType: 'CD' } })).id;
  unitB = (await prisma.unit.create({ data: { code: `B-${sfx}`, name: `AO B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `s-${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  gerId = (await prisma.user.create({ data: { name: 'Ger', email: `g-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  outroSupId = (await prisma.user.create({ data: { name: 'Outro', email: `o-${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: supId, unitId: unitA }, { userId: gerId, unitId: unitA }, { userId: outroSupId, unitId: unitB }] });
});

afterAll(async () => {
  await prisma.supervisorVisit.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.visitAction.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [supId, gerId, outroSupId] } } });
  await prisma.$disconnect();
});

describe('visita operacional', () => {
  it('escopo: supervisor de outra unidade e gerente não iniciam', async () => {
    expect(await iniciarVisita(outroSup(), { unitId: unitA })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await iniciarVisita(gerente(), { unitId: unitA })).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('inicia com roteiro do TIPO da unidade (CD) e congela o resumo pré-visita', async () => {
    const r = await iniciarVisita(supervisor(), { unitId: unitA });
    expect(r.ok).toBe(true);
    visita1 = r.ok ? r.id : '';
    const d = (await getVisitaOperacional(supervisor(), visita1))!;
    const chaves = d.respostas.map((x) => x.itemKey);
    expect(d.respostas.length).toBeGreaterThan(5);
    expect(d.respostas.some((x) => x.text.includes('Separação e expedição'))).toBe(true);
    expect(d.respostas.some((x) => x.section === 'Salão')).toBe(false);
    expect(chaves.every((k) => !k.startsWith('dir:') || d.alertas.some((a) => `dir:${a.chave}` === k))).toBe(true);
    // idempotente
    const de_novo = await iniciarVisita(supervisor(), { visitId: visita1 });
    expect(de_novo).toEqual({ ok: true, id: visita1 });
    expect(await prisma.visitAuditResponse.count({ where: { visitId: visita1 } })).toBe(d.respostas.length);
  });

  it('responde, cria ação e finaliza com resultado congelado; a operação não é alterada', async () => {
    const antes = await prisma.taskInstance.count({ where: { unitId: unitA } });
    const d = (await getVisitaOperacional(supervisor(), visita1))!;
    const simples = d.respostas.filter((x) => x.mode === 'SIMPLES' && !x.itemKey.startsWith('dir:'));
    const amostra = d.respostas.find((x) => x.mode === 'AMOSTRAGEM')!;
    await responderItem(supervisor(), { responseId: simples[0].id, answer: 'CONFORME' });
    await responderItem(supervisor(), { responseId: simples[1].id, answer: 'NAO_CONFORME', gravity: 'CRITICA', note: 'sujo' });
    await responderItem(supervisor(), { responseId: simples[2].id, answer: 'NAO_SE_APLICA' });
    const am = await responderItem(supervisor(), { responseId: amostra.id, sampleChecked: 4, sampleOk: 3 });
    expect(am.ok && am.answer).toBe('NAO_CONFORME');
    expect(await responderItem(supervisor(), { responseId: amostra.id, sampleChecked: 2, sampleOk: 5 })).toMatchObject({ ok: false, reason: 'INVALID' });
    const acao = await criarAcao(supervisor(), { visitId: visita1, responseId: simples[1].id, problem: 'Limpar', responsibleName: 'Gerente', dueDate: '2020-01-01', gravity: 'CRITICA' });
    expect(acao.ok).toBe(true);
    const f = await finalizarVisita(supervisor(), { visitId: visita1 });
    expect(f.ok).toBe(true);
    if (f.ok) expect(f.resumo.aderencia).toMatchObject({ conformes: 1, naoConformes: 2, naoAplicaveis: 1, criticos: 1, pontosConferidos: 6, pontosConformes: 4, pct: 66.7 });
    const v = await prisma.supervisorVisit.findUniqueOrThrow({ where: { id: visita1 } });
    expect(v.status).toBe('DONE');
    expect(v.summary).toBeTruthy();
    expect(await prisma.taskInstance.count({ where: { unitId: unitA } })).toBe(antes); // conferência não mexe na operação
    // visita encerrada não aceita resposta nem é concluída pela tela simples
    expect(await responderItem(supervisor(), { responseId: simples[0].id, answer: 'NAO_CONFORME' })).toMatchObject({ ok: false, reason: 'ENCERRADA' });
  });

  it('visita operacional em andamento não é concluída pela tela simples', async () => {
    const r = await iniciarVisita(supervisor(), { unitId: unitA });
    const res = await completeVisit(supervisor(), r.ok ? r.id : '', { feedback: 'x' });
    expect(res.ok).toBe(false);
    await prisma.supervisorVisit.update({ where: { id: r.ok ? r.id : '' }, data: { status: 'CANCELED' } });
  });

  it('a unidade informa; a próxima visita valida; ação vencida aparece; reincidência conta', async () => {
    const acoes = await listarAcoesDoAlcance(gerente());
    expect(acoes).toHaveLength(1);
    expect(acoes[0].situacao).toBe('VENCIDO'); // prazo 2020
    expect(await listarAcoesDoAlcance(outroSup())).toHaveLength(0);
    expect((await atualizarAcaoPelaUnidade(gerente(), { actionId: acoes[0].id, status: 'AGUARDANDO_VALIDACAO', nota: 'feito' })).ok).toBe(true);
    expect(await atualizarAcaoPelaUnidade(outroSup(), { actionId: acoes[0].id, status: 'EM_ANDAMENTO' })).toEqual({ ok: false, reason: 'FORBIDDEN' });

    const r2 = await iniciarVisita(supervisor(), { unitId: unitA });
    const v2 = r2.ok ? r2.id : '';
    const d2 = (await getVisitaOperacional(supervisor(), v2))!;
    expect(d2.pendencias.map((p) => p.id)).toContain(acoes[0].id);
    expect(d2.alertas.some((a) => a.chave === 'acoes-validar')).toBe(true);
    expect((await validarAcao(supervisor(), { actionId: acoes[0].id, visitId: v2, resolvido: true })).ok).toBe(true);
    const valid = await prisma.visitAction.findUniqueOrThrow({ where: { id: acoes[0].id } });
    expect(valid).toMatchObject({ status: 'RESOLVIDO', validatedByName: 'Sup', validatedVisitId: v2 });

    // repete a mesma não conformidade do catálogo → reincidência
    const v1 = (await getVisitaOperacional(supervisor(), visita1))!;
    const ncAntes = v1.respostas.find((x) => x.answer === 'NAO_CONFORME' && x.itemId && x.mode === 'SIMPLES')!;
    const mesmo = d2.respostas.find((x) => x.itemId === ncAntes.itemId)!;
    await responderItem(supervisor(), { responseId: mesmo.id, answer: 'NAO_CONFORME', gravity: 'MEDIA' });
    const f2 = await finalizarVisita(supervisor(), { visitId: v2 });
    expect(f2.ok && f2.resumo.reincidencias).toBe(1);
    expect(f2.ok && f2.resumo.pendenciasAnteriores).toEqual({ verificadas: 1, resolvidas: 1, permanecem: 0 });
  });

  it('indicadores: aderência só de quem foi visitado; sem visita fica separado', async () => {
    const ind = await getIndicadoresOperacionais(supervisor(), hoje.slice(0, 7));
    const a = ind.linhas.find((l) => l.unitId === unitA)!;
    expect(a.visitas).toBe(2);
    expect(a.aderencia).not.toBeNull();
    expect(ind.rede.taxaResolucao).toBe(100);
  });
});

describe('itens direcionados — Verificado / Requer ação / Não se aplica (v1.155.1)', () => {
  it('Verificado só registra; Requer ação e Não se aplica exigem texto; ficam fora da aderência', async () => {
    // força um alerta real: ação vencida da unidade → item direcionado no roteiro
    await prisma.visitAction.create({ data: { visitId: visita1, unitId: unitA, problem: 'Pendência antiga', category: 'Geral', dueDate: '2020-01-01', createdByName: 'Sup' } });
    const r = await iniciarVisita(supervisor(), { unitId: unitA });
    const v = r.ok ? r.id : '';
    const d = (await getVisitaOperacional(supervisor(), v))!;
    const dirs = d.respostas.filter((x) => x.level === 'DIRECIONADA');
    expect(dirs.length).toBeGreaterThan(0);
    const [primeiro] = dirs;
    const acoesAntes = await prisma.visitAction.count({ where: { visitId: v } });
    const occAntes = await prisma.occurrence.count({ where: { unitId: unitA } });
    expect((await responderItem(supervisor(), { responseId: primeiro.id, answer: 'CONFORME' })).ok).toBe(true);
    expect(await prisma.visitAction.count({ where: { visitId: v } })).toBe(acoesAntes);
    expect(await prisma.occurrence.count({ where: { unitId: unitA } })).toBe(occAntes);
    expect(await responderItem(supervisor(), { responseId: primeiro.id, answer: 'NAO_SE_APLICA' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect((await responderItem(supervisor(), { responseId: primeiro.id, answer: 'NAO_SE_APLICA', note: 'pendência já não existe' })).ok).toBe(true);
    expect(await responderItem(supervisor(), { responseId: primeiro.id, answer: 'NAO_CONFORME' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect((await responderItem(supervisor(), { responseId: primeiro.id, answer: 'NAO_CONFORME', note: 'continua pendente' })).ok).toBe(true);
    const simples = d.respostas.find((x) => x.level !== 'DIRECIONADA' && x.mode === 'SIMPLES')!;
    await responderItem(supervisor(), { responseId: simples.id, answer: 'CONFORME' });
    const f = await finalizarVisita(supervisor(), { visitId: v });
    expect(f.ok).toBe(true);
    if (f.ok) {
      expect(f.resumo.aderencia).toMatchObject({ conformes: 1, naoConformes: 0, pct: 100 }); // direcionada fora da conta
      expect(f.resumo.dadosSgo).toMatchObject({ requerAcao: 1 });
    }
  });
});
