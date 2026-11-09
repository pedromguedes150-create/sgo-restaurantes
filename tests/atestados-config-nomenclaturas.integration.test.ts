import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { atualizarConfigDaNomenclatura, listarConfigDasNomenclaturas, nomenclaturasAtivas, carregarConfigDasNomenclaturas, nomeNoRh, nomenclaturaPeloNomeDoRh, diasDaRegraCom } from '@/lib/certificates/config-nomenclaturas';
import { createCertificate } from '@/lib/certificates/save';
import { handleAtestadoSituacao } from '@/lib/certificates/retorno-rh';
import { listCertificates } from '@/lib/certificates/query';
import { payloadAtestado } from '@/lib/rh/saida/regras';
import type { SessionUser } from '@/lib/auth/session';

/**
 * ETAPA C (v1.198.0): a correspondência SGO ↔ RH configurável — nome no RH,
 * nomenclatura ativa/inativa, dias da regra — e o que ela muda no envio, no
 * retorno do RH e nos alertas. ⚠️ A configuração é GLOBAL no banco de dev: o
 * teste usa nomenclaturas pouco prováveis em outros arquivos e desfaz tudo.
 */
const sfx = `cf${process.pid.toString(36)}`;
let unitId: string; let adminId: string; let colab = '';
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: adminId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const DOC = 'uploads/teste/documento-c.jpg';
const NOMES = ['Licença-casamento', 'Vestibular', 'Trabalho eleitoral (mesário)'];

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `CF-${sfx}`, name: `U Config ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  colab = (await prisma.collaborator.create({ data: { name: `CARLA CF ${sfx}`, jobTitle: 'Salão', cpf: '11122233344', units: { create: { unitId } } } })).id;
  await prisma.certificateNomenclatureConfig.deleteMany({ where: { nomenclature: { in: NOMES } } });
});

afterAll(async () => {
  await prisma.certificateNomenclatureConfig.deleteMany({ where: { nomenclature: { in: NOMES } } }).catch(() => {});
  await prisma.rhOutboundEvent.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.rhInboundEvent.deleteMany({ where: { event: 'atestado_situacao', createdAt: { gte: new Date(Date.now() - 600_000) } } }).catch(() => {});
  await prisma.medicalCertificate.deleteMany({ where: { collaboratorId: colab } }).catch(() => {});
  await prisma.rhScheduleNotice.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: colab } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaborator.delete({ where: { id: colab } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('configuração das nomenclaturas', () => {
  it('a lista é o catálogo inteiro (25) com a regra vigente de hoje; só ADMIN/CEO grava; nome fora do catálogo é NOT_FOUND', async () => {
    const lista = await listarConfigDasNomenclaturas();
    expect(lista.length).toBe(25);
    const pat = lista.find((n) => n.nome === 'Licença-paternidade')!;
    expect(pat.regraVigente?.dias).toBe(5); // hoje (2026) — vira 10 em 2027
    expect(pat.diasVigentes).toBe(5);
    expect(lista.find((n) => n.nome === 'Atestado médico')?.regraVigente).toBeNull();
    expect((await atualizarConfigDaNomenclatura(gerente(), 'Licença-casamento', { rhName: 'x' })).ok).toBe(false);
    expect(await atualizarConfigDaNomenclatura(admin(), 'Documento inventado', { rhName: 'x' })).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
  });

  it('nome no RH: gravado, usado no envio ("[Nome do RH]") e reconhecido no retorno; dois tipos do SGO não podem ter o mesmo nome no RH', async () => {
    expect((await atualizarConfigDaNomenclatura(admin(), 'Licença-casamento', { rhName: 'Licença gala (RH)' })).ok).toBe(true);
    const cfg = await carregarConfigDasNomenclaturas();
    expect(nomeNoRh('Licença-casamento', cfg)).toBe('Licença gala (RH)');
    expect(nomeNoRh('Atestado médico', cfg)).toBe('Atestado médico');
    expect(nomenclaturaPeloNomeDoRh('licença gala (rh)', cfg)?.nome).toBe('Licença-casamento');
    expect(nomenclaturaPeloNomeDoRh('Licença-casamento', cfg)?.nome).toBe('Licença-casamento'); // o nome do catálogo continua valendo
    const dup = await atualizarConfigDaNomenclatura(admin(), 'Vestibular', { rhName: 'Licença gala (RH)' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.message).toMatch(/já é o nome no RH/);
    const colide = await atualizarConfigDaNomenclatura(admin(), 'Vestibular', { rhName: 'Atestado médico' });
    expect(colide.ok).toBe(false);

    // o envio ao RH leva o nome do RH no prefixo e motivo OUTROS (licença não é doença)
    const c = await createCertificate(gerente(), { unitId, collaboratorId: colab, nomenclatura: 'Licença-casamento', startDate: '2026-11-20', endDate: '2026-11-22', attachmentPath: DOC });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const ev = await prisma.rhOutboundEvent.findFirst({ where: { tipo: 'ATESTADO', referenceId: c.id, acao: 'criar' } });
    expect((ev?.payload as { observacoes: string }).observacoes).toBe('[Licença gala (RH)]');
    expect((ev?.payload as { motivo: string }).motivo).toBe('OUTROS');
    expect((ev?.payload as { tipoDetalhe: string }).tipoDetalhe).toBe('FULL_DAY');

    // o RH devolve com a grafia DELE e o SGO reclassifica certo
    const outro = await createCertificate(gerente(), { unitId, collaboratorId: colab, startDate: '2026-11-25', endDate: '2026-11-25', attachmentPath: DOC });
    if (!outro.ok) throw new Error('não criou');
    const r = await handleAtestadoSituacao({ sgoMovimentoId: outro.id, situacao: 'validado', nomenclaturaRh: 'Licença gala (RH)' });
    expect(r.httpStatus).toBe(200);
    expect((await prisma.medicalCertificate.findUnique({ where: { id: outro.id } }))?.nomenclature).toBe('Licença-casamento');
  });

  it('motivo do contrato pelo grupo: atestado = DOENCA, acompanhante = ACOMPANHANTE, licença/comparecimento de dia = OUTROS', () => {
    const base = { id: 'x', cpf: '11122233344', startDate: '2026-11-01', endDate: '2026-11-02' };
    expect(payloadAtestado({ ...base, type: 'FULL_DAY', grupo: 'ATESTADO', nomenclature: 'Atestado médico' }, 'criar').motivo).toBe('DOENCA');
    expect(payloadAtestado({ ...base, type: 'FULL_DAY', grupo: 'AFASTAMENTO', nomenclature: 'Afastamento pelo INSS' }, 'criar').motivo).toBe('DOENCA');
    expect(payloadAtestado({ ...base, type: 'COMPANION', grupo: 'COMPARECIMENTO', nomenclature: 'Acompanhante de familiar' }, 'criar').motivo).toBe('ACOMPANHANTE');
    expect(payloadAtestado({ ...base, type: 'FULL_DAY', grupo: 'LICENCA', nomenclature: 'Licença-paternidade' }, 'criar').motivo).toBe('OUTROS');
    expect(payloadAtestado({ ...base, type: 'FULL_DAY', grupo: 'COMPARECIMENTO', nomenclature: 'Vestibular' }, 'criar').motivo).toBe('OUTROS');
    expect(payloadAtestado({ ...base, type: 'FULL_DAY' }, 'criar').motivo).toBe('DOENCA'); // registro antigo, sem grupo: como sempre
  });

  it('dias da regra: a sobreposição do Admin vale na leitura e nos alertas; valor inválido ou em tipo sem regra é recusado', async () => {
    expect((await atualizarConfigDaNomenclatura(admin(), 'Trabalho eleitoral (mesário)', { ruleDays: 4 })).ok).toBe(true);
    const cfg = await carregarConfigDasNomenclaturas();
    expect(diasDaRegraCom(cfg)('Trabalho eleitoral (mesário)', '2026-11-09')).toBe(4);
    expect(diasDaRegraCom(cfg)('Licença-casamento', '2026-11-09')).toBe(3); // sem sobreposição: tabela
    expect((await atualizarConfigDaNomenclatura(admin(), 'Vestibular', { ruleDays: 400 })).ok).toBe(false);
    expect((await atualizarConfigDaNomenclatura(admin(), 'Atestado médico', { ruleDays: 3 })).ok).toBe(false); // atestado não tem regra de duração
    // 4 dias lançados de mesário = sem alerta de prazo (a regra agora é 4)
    const c = await createCertificate(gerente(), { unitId, collaboratorId: colab, nomenclatura: 'Trabalho eleitoral (mesário)', startDate: '2026-12-01', endDate: '2026-12-04', attachmentPath: DOC });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.alertas.some((a) => a.tipo === 'PRAZO_DIFERENTE')).toBe(false);
    const l = (await listCertificates(admin(), { unitId })).find((x) => x.id === c.id)!;
    expect(l.alertas.some((a) => a.tipo === 'PRAZO_DIFERENTE')).toBe(false);
  });

  it('nomenclatura inativa sai da lista fechada da IA (os documentos já gravados não mudam); reativar a devolve', async () => {
    expect((await atualizarConfigDaNomenclatura(admin(), 'Vestibular', { active: false })).ok).toBe(true);
    expect((await nomenclaturasAtivas()).some((n) => n.nome === 'Vestibular')).toBe(false);
    expect((await nomenclaturasAtivas()).length).toBe(24 - (await prisma.certificateNomenclatureConfig.count({ where: { active: false, nomenclature: { notIn: NOMES } } })));
    expect((await atualizarConfigDaNomenclatura(admin(), 'Vestibular', { active: true })).ok).toBe(true);
    expect((await nomenclaturasAtivas()).some((n) => n.nome === 'Vestibular')).toBe(true);
  });

  it('caso 3 (integração): dois atestados sucessivos do mesmo colaborador em 60 dias somando mais de 15 dias geram o alerta de intercalados e o aviso aos Admins', async () => {
    const a = await createCertificate(gerente(), { unitId, collaboratorId: colab, nomenclatura: 'Atestado médico', startDate: '2026-09-01', endDate: '2026-09-10', attachmentPath: DOC });
    const b = await createCertificate(gerente(), { unitId, collaboratorId: colab, nomenclatura: 'Atestado médico', startDate: '2026-10-01', endDate: '2026-10-08', attachmentPath: DOC });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.alertas.some((x) => x.tipo === 'INTERCALADOS_60')).toBe(false); // o primeiro, sozinho, não
    const inter = b.alertas.find((x) => x.tipo === 'INTERCALADOS_60')!;
    expect(inter.relacionados).toEqual([a.id]);
    const aviso = await prisma.notification.findFirst({ where: { title: { contains: 'Atestados intercalados' }, link: { contains: b.id } } });
    expect(aviso?.level).toBe('IMPORTANTE');
    // na lista, o PRIMEIRO também passa a mostrar o alerta (a janela olha para os dois lados)
    const lista = await listCertificates(admin(), { unitId });
    expect(lista.find((x) => x.id === a.id)?.alertas.some((x) => x.tipo === 'INTERCALADOS_60')).toBe(true);
  });
});
