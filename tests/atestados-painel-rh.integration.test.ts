import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createCertificate } from '@/lib/certificates/save';
import { handleAtestadoSituacao } from '@/lib/certificates/retorno-rh';
import { getPainelDoRh } from '@/lib/certificates/painel-rh';
import type { SessionUser } from '@/lib/auth/session';

/**
 * ETAPA D (v1.199.0): o painel do RH é COMPOSIÇÃO do Histórico + fila de saída +
 * configuração — mesmo escopo, nada gravado.
 */
const sfx = `pr${process.pid.toString(36)}`;
let unitId: string; let outraUnit: string; let adminId: string; let colab = ''; let colabOutra = '';
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });
const soUnidade = (): SessionUser => ({ id: adminId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const DOC = 'uploads/teste/documento-d.jpg';
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PR-${sfx}`, name: `U Painel ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnit = (await prisma.unit.create({ data: { code: `PR-O-${sfx}`, name: `U Outra ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  colab = (await prisma.collaborator.create({ data: { name: `DORA PR ${sfx}`, jobTitle: 'Salão', units: { create: { unitId } } } })).id; // sem CPF de propósito → envio ERRO
  colabOutra = (await prisma.collaborator.create({ data: { name: `ELI PR ${sfx}`, jobTitle: 'Salão', cpf: '55566677788', units: { create: { unitId: outraUnit } } } })).id;
});

afterAll(async () => {
  await prisma.rhOutboundEvent.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } }).catch(() => {});
  await prisma.rhInboundEvent.deleteMany({ where: { event: 'atestado_situacao', createdAt: { gte: new Date(Date.now() - 600_000) } } }).catch(() => {});
  await prisma.medicalCertificate.deleteMany({ where: { collaboratorId: { in: [colab, colabOutra] } } }).catch(() => {});
  await prisma.rhScheduleNotice.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } }).catch(() => {});
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: { in: [colab, colabOutra] } } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [colab, colabOutra] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnit] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('getPainelDoRh', () => {
  it('reúne: envio com erro (sem CPF), correção antiga sem reenvio, sem retorno do RH, classificação pendente, retorno próximo — e respeita o escopo', async () => {
    const semCpf = await createCertificate(admin(), { unitId, collaboratorId: colab, nomenclatura: 'Atestado médico', startDate: '2026-11-03', endDate: '2026-11-04', attachmentPath: DOC });
    const correcao = await createCertificate(admin(), { unitId, collaboratorId: colab, nomenclatura: 'Atestado odontológico', startDate: '2026-11-06', endDate: '2026-11-06', attachmentPath: DOC });
    const parado = await createCertificate(admin(), { unitId, collaboratorId: colab, nomenclatura: 'Consulta médica', startDate: '2026-11-08', endDate: '2026-11-08', hours: 2, attachmentPath: DOC });
    const pendente = await createCertificate(admin(), { unitId, collaboratorId: colab, startDate: '2026-10-20', endDate: '2026-10-20', attachmentPath: DOC });
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const fim = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const volta = await createCertificate(admin(), { unitId, collaboratorId: colab, nomenclatura: 'Licença-casamento', startDate: hoje, endDate: fim, attachmentPath: DOC });
    const foraDoAlcance = await createCertificate(admin(), { unitId: outraUnit, collaboratorId: colabOutra, nomenclatura: 'Atestado médico', startDate: '2026-11-03', endDate: '2026-11-04', attachmentPath: DOC });
    for (const r of [semCpf, correcao, parado, pendente, volta, foraDoAlcance]) expect(r.ok).toBe(true);
    if (!semCpf.ok || !correcao.ok || !parado.ok || !pendente.ok || !volta.ok || !foraDoAlcance.ok) return;

    // RH pediu correção há 10 dias e ninguém reenviou
    await handleAtestadoSituacao({ sgoMovimentoId: correcao.id, situacao: 'correcao_solicitada', motivo: 'ilegivel', observacao: 'Tire outra foto.' });
    await prisma.medicalCertificate.update({ where: { id: correcao.id }, data: { statusAt: diasAtras(10) } });
    // enviado ao RH há 9 dias sem decisão
    await prisma.medicalCertificate.update({ where: { id: parado.id }, data: { status: 'ENVIADO_RH', statusAt: diasAtras(9) } });

    const p = await getPainelDoRh(admin(), {});
    const ids = (tipo: string) => p.pendencias.filter((x) => x.tipo === tipo).map((x) => x.doc.id);
    expect(ids('ENVIO_COM_ERRO')).toEqual(expect.arrayContaining([semCpf.id])); // todos da Dora estão sem CPF → erro; o concluído não entra
    expect(p.pendencias.find((x) => x.tipo === 'ENVIO_COM_ERRO' && x.doc.id === semCpf.id)?.detalhe).toMatch(/sem CPF/);
    expect(ids('CORRECAO_SEM_RESPOSTA')).toEqual([correcao.id]);
    expect(ids('SEM_RETORNO_DO_RH')).toEqual([parado.id]);
    expect(ids('CLASSIFICACAO_PENDENTE')).toEqual([pendente.id]);
    expect(ids('RETORNO_PROXIMO')).toEqual([volta.id]);
    expect(p.resumo.CORRECAO_SEM_RESPOSTA).toBe(1);
    expect(p.porSituacao.some((s) => s.status === 'CORRECAO_SOLICITADA' && s.count >= 1)).toBe(true);
    expect(p.porNomenclatura.find((n) => n.rotulo === 'Licença-casamento')?.count).toBeGreaterThanOrEqual(1);
    expect(p.nomenclaturas.total).toBe(25);
    expect(p.linhas.find((l) => l.id === semCpf.id)?.envioRh?.status).toBe('ERRO');

    // escopo: quem só vê a unidade A não vê o documento da outra unidade
    const so = await getPainelDoRh(soUnidade(), {});
    expect(so.linhas.some((l) => l.id === foraDoAlcance.id)).toBe(false);
    expect(so.linhas.some((l) => l.id === correcao.id)).toBe(true);
    // filtro de unidade em AND
    const filtrado = await getPainelDoRh(admin(), { unitId: outraUnit });
    expect(filtrado.linhas.map((l) => l.id)).toEqual([foraDoAlcance.id]);
  });
});
