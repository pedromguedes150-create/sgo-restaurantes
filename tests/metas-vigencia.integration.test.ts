import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { carregarConfigDaMeta, gravarConfigDaMeta, historicoDeConfiguracoes, mesAtual } from '@/lib/metas/vigencia';
import { getComponentStatus, getUtensilsMetaWeight, setComponentStatus, setUtensilsMetaWeight } from '@/lib/metas/config';
import { componentesDaMeta } from '@/lib/metas/componentes';
import { pontuar } from '@/lib/metas/pontuacao';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import { getMetaBreakdown } from '@/lib/metas/query';

/**
 * META v1.180.0 — a configuração com VIGÊNCIA e STATUS, contra o banco.
 * Usa só o componente UTENSÍLIOS (peso 0 e fora da nota em qualquer ambiente)
 * e grava para o MÊS SEGUINTE: nada do mês corrente muda para os outros
 * testes, e o mês seguinte prova que a vigência vale — e que o status veta o
 * peso.
 */
const sfx = `vig${process.pid.toString(36)}`;
let admin: SessionUser;
const supervisor: SessionUser = { id: 'sup', name: 'Sup', role: 'SUPERVISOR', unitIds: [], seesAllUnits: true, needsTerms: false };
const hoje = mesAtual();
const proximo = (() => { const [y, m] = hoje.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); })();
const anterior = (() => { const [y, m] = hoje.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); })();
const CHAVES = ['UTENSILS_META_WEIGHT', 'UTENSILS_META_STATUS'];

let idsAntes: string[] = [];
let pesoAntes = 0; let statusAntes = '';
let unitId = '';

beforeAll(async () => {
  const adm = await prisma.user.create({ data: { name: `Admin ${sfx}`, email: `adm-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } });
  admin = { id: adm.id, name: adm.name, role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
  idsAntes = (await prisma.metaConfigChange.findMany({ where: { key: { in: CHAVES } }, select: { id: true } })).map((r) => r.id);
  pesoAntes = await getUtensilsMetaWeight();
  statusAntes = await getComponentStatus('UTENSILS');
  unitId = (await prisma.unit.create({ data: { code: `VIG-${sfx}`, name: `Vigência ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  /* um checklist feito no MÊS SEGUINTE: a nota do mês seguinte fica em 100% só com os checklists */
  const tpl = await prisma.taskTemplate.create({ data: { unitId, name: `T ${sfx}`, limitTime: '10:00', entersMeta: true } });
  await prisma.taskInstance.create({ data: { templateId: tpl.id, unitId, operationalDate: `${proximo}-02`, dueAt: new Date(), status: 'DONE', completedAt: new Date() } });
});
afterAll(async () => {
  await prisma.metaConfigChange.deleteMany({ where: { key: { in: CHAVES }, id: { notIn: idsAntes } } });
  await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
  await prisma.user.delete({ where: { id: admin.id } });
  await prisma.taskInstance.deleteMany({ where: { unitId } });
  await prisma.taskTemplate.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } });
});

describe('gravarConfigDaMeta', () => {
  it('recusa quem não é Admin, mês encerrado e motivo curto — e nada é gravado', async () => {
    expect(await gravarConfigDaMeta(supervisor, { key: 'UTENSILS_META_WEIGHT', value: 5, reason: 'motivo suficiente aqui', action: 'X' })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await gravarConfigDaMeta(admin, { key: 'UTENSILS_META_WEIGHT', value: 5, validFrom: anterior, reason: 'motivo suficiente aqui', action: 'X' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await gravarConfigDaMeta(admin, { key: 'UTENSILS_META_WEIGHT', value: 5, validFrom: proximo, reason: 'curto', action: 'X' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await gravarConfigDaMeta(admin, { key: 'XPTO', value: 5, reason: 'motivo suficiente aqui', action: 'X' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect((await prisma.metaConfigChange.findMany({ where: { key: { in: CHAVES }, id: { notIn: idsAntes } } })).length).toBe(0);
  });

  it('peso para o MÊS SEGUINTE: o mês corrente não muda, o seguinte lê o novo; linha-base + histórico + auditoria', async () => {
    const r = await setUtensilsMetaWeight(admin, 7, { reason: 'Teste de vigência: utensílios ganham peso no mês seguinte', validFrom: proximo });
    expect(r).toMatchObject({ ok: true, validFrom: proximo, para: '7' });
    expect(await getUtensilsMetaWeight()).toBe(pesoAntes);
    expect(await getUtensilsMetaWeight(hoje)).toBe(pesoAntes);
    expect(await getUtensilsMetaWeight(proximo)).toBe(7);
    expect(await getUtensilsMetaWeight(anterior)).toBe(pesoAntes);
    const novas = await prisma.metaConfigChange.findMany({ where: { key: 'UTENSILS_META_WEIGHT', id: { notIn: idsAntes } }, orderBy: { createdAt: 'asc' } });
    /* primeira gravação da chave: nasce a linha-base com o valor anterior, válida para todo mês antes da vigência */
    expect(novas.map((n) => [n.validFrom, n.value])).toEqual([['0000-01', String(pesoAntes)], [proximo, '7']]);
    expect(novas[1]).toMatchObject({ previousValue: String(pesoAntes), reason: 'Teste de vigência: utensílios ganham peso no mês seguinte', userName: admin.name });
    /* vigência futura NÃO mexe no app_settings (o valor "de agora" segue o de antes) */
    const s = await prisma.appSetting.findUnique({ where: { key: 'UTENSILS_META_WEIGHT' } });
    expect(Number(s?.value ?? 0)).toBe(pesoAntes);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'UTENSILS_META_WEIGHT_SET', entityId: 'UTENSILS_META_WEIGHT' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.metadata).toMatchObject({ de: String(pesoAntes), para: '7', vigencia: proximo });
    const hist = await historicoDeConfiguracoes();
    const linha = hist.find((h) => h.key === 'UTENSILS_META_WEIGHT' && h.validFrom === proximo)!;
    expect(linha).toMatchObject({ rotulo: 'Peso — Inventário de utensílios (enviado no mês)', de: String(pesoAntes), para: '7', futura: true });
  });

  it('gravar o mesmo valor que já vale não cria linha', async () => {
    const antes = await prisma.metaConfigChange.count({ where: { key: 'UTENSILS_META_WEIGHT' } });
    expect(await setUtensilsMetaWeight(admin, 7, { reason: 'repetindo o mesmo valor de propósito', validFrom: proximo })).toMatchObject({ ok: true });
    expect(await prisma.metaConfigChange.count({ where: { key: 'UTENSILS_META_WEIGHT' } })).toBe(antes);
  });

  it('STATUS independente do peso: em homologação no mês seguinte, utensílios (peso 7) ficam FORA da nota e aparecem em observação com a nota simulada', async () => {
    expect(await setComponentStatus(admin, 'UTENSILS', 'HOMOLOGACAO', { reason: 'Homologando a contagem de utensílios antes de contar', validFrom: proximo })).toMatchObject({ ok: true, para: 'HOMOLOGACAO' });
    expect(await getComponentStatus('UTENSILS', hoje)).toBe(statusAntes);
    expect(await getComponentStatus('UTENSILS', proximo)).toBe('HOMOLOGACAO');

    const comps = await componentesDaMeta(unitId, proximo);
    const ut = comps.find((c) => c.key === 'UTENSILS')!;
    expect(ut).toMatchObject({ weight: 7, status: 'HOMOLOGACAO', done: 0, missed: 1 });
    const tasks = comps.find((c) => c.key === 'TASKS')!;
    expect(tasks).toMatchObject({ done: 1, missed: 0, status: 'ATIVO' });

    /* a nota do mês seguinte: só os checklists (100%); utensílios pesaria 7 a 0% se contasse */
    const score = await getUnitMonthScore(unitId, proximo);
    expect(score.scorePct).toBe(pontuar(comps.filter((c) => c.key !== 'UTENSILS')).scorePct);
    expect(score.resolvedWeight).toBe(tasks.weight);
    const linhas = await getMetaBreakdown(unitId, proximo);
    const obs = linhas.find((l) => l.tipo === 'OBSERVACAO' && l.name.startsWith('Inventário de utensílios'))!;
    expect(obs).toMatchObject({ weight: 7, scorePct: 0, status: 'HOMOLOGACAO' });
    expect(obs.notaSeContasse).toBe(pontuar(comps.map((c) => (c.key === 'UTENSILS' ? { ...c, status: 'ATIVO' as const } : c))).scorePct);
    expect(obs.notaSeContasse!).toBeLessThan(score.scorePct);
    /* e a linha que PESA não inclui utensílios */
    expect(linhas.filter((l) => !l.tipo).map((l) => l.name)).not.toContain('Inventário de utensílios (enviado no mês)');
  });

  it('a leitura por mês é uma só: carregarConfigDaMeta devolve peso, status e descontos vigentes', async () => {
    const v = await carregarConfigDaMeta(proximo);
    expect(v.peso('UTENSILS')).toBe(7);
    expect(v.status('UTENSILS')).toBe('HOMOLOGACAO');
    expect(v.descontoForaDoPrazo).toBeGreaterThanOrEqual(0);
    expect(v.descontoEscalaGerentes).toBeGreaterThanOrEqual(0);
    expect(v.valor('UTENSILS_META_STATUS')).toBe('HOMOLOGACAO');
  });
});
