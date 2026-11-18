import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { encaminharCurriculo, getCurriculo, indicadoresDosCurriculos, listarCurriculos } from '@/lib/curriculos/curriculos';
import { handleCurriculoSituacao } from '@/lib/curriculos/retorno-rh';
import { criarCargo, listarCargos } from '@/lib/curriculos/cargos';
import { criarChave, definirLeituraDeCurriculos } from '@/lib/api-global/chaves';
import { GET as listaV1 } from '@/app/api/v1/curriculos/route';

/**
 * CENTRAL DE CURRÍCULOS (v1.212.0) — encaminhar, escopo por unidade, a situação
 * que só o RH muda, e a leitura pela API liberada chave a chave.
 */
const sfx = `cv${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitA: string; let unitB: string; let cargoId: string; let cargoInativoId: string;
let gerA: SessionUser; let gerB: SessionUser; let caixa: SessionUser; let admin: SessionUser;
const chaves: string[] = [];
const novo = (over: Record<string, unknown> = {}) => ({
  unitId: unitA, candidateName: 'Maria da Silva', phone: '(31) 99999-0001', jobTitleId: cargoId, note: 'entregou em mãos',
  attachmentPath: `uploads/_privado/curriculos/${unitA}/cv-${sfx}.pdf`, attachmentMime: 'application/pdf', ...over,
});

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `A-${sfx}`, name: `CV A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `B-${sfx}`, name: `CV B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  const mk = async (nome: string, role: SessionUser['role'], unitIds: string[], seesAllUnits = false): Promise<SessionUser> => {
    const u = await prisma.user.create({ data: { name: `${nome} ${sfx}`, email: `${nome}-${sfx}@e.com`, role, passwordHash: 'x', memberships: { create: unitIds.map((unitId) => ({ unitId })) } } });
    return { id: u.id, name: u.name, role, unitIds, seesAllUnits, needsTerms: false };
  };
  gerA = await mk('gera', 'MANAGER', [unitA]);
  gerB = await mk('gerb', 'MANAGER', [unitB]);
  caixa = await mk('cx', 'CASHIER', [unitA]);
  admin = await mk('adm', 'ADMIN', [], true);
  await listarCargos(); // semeia os padrões
  const c = await criarCargo(admin, `Cargo ${sfx}`);
  if (!c.ok || !c.id) throw new Error('cargo');
  cargoId = c.id;
  cargoInativoId = (await prisma.resumeJobTitle.create({ data: { name: `Inativo ${sfx}`, active: false, order: 999 } })).id;
});

afterAll(async () => {
  await prisma.candidateResume.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.resumeJobTitle.deleteMany({ where: { id: { in: [cargoId, cargoInativoId] } } });
  await prisma.rhInboundEvent.deleteMany({ where: { event: 'curriculo_situacao', message: { contains: sfx } } });
  await prisma.apiRequestLog.deleteMany({ where: { clientId: { in: chaves } } });
  await prisma.apiClient.deleteMany({ where: { id: { in: chaves } } });
  const us = [gerA.id, gerB.id, caixa.id, admin.id];
  await prisma.notification.deleteMany({ where: { userId: { in: us } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: us } }, { unitId: { in: [unitA, unitB] } }] } });
  await prisma.user.deleteMany({ where: { id: { in: us } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.$disconnect();
});

describe('encaminhar', () => {
  let id: string;
  it('o gerente encaminha pela unidade dele: nasce RECEBIDO, com o cargo congelado e a linha do tempo', async () => {
    const r = await encaminharCurriculo(gerA, novo());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id = r.id;
    const c = await getCurriculo(gerA, id);
    expect(c).toMatchObject({ status: 'RECEBIDO', candidateName: 'Maria da Silva', phone: '31999990001', jobTitleName: `Cargo ${sfx}`, createdById: gerA.id });
    expect(c?.events.map((e) => e.kind)).toEqual(['ENCAMINHADO']);
  });
  it('a Auditoria não guarda nome nem telefone do candidato', async () => {
    const log = await prisma.auditLog.findFirst({ where: { entityId: id, action: 'RESUME_FORWARDED' } });
    expect(log).toBeTruthy();
    expect(JSON.stringify(log?.metadata)).not.toContain('Maria');
    expect(JSON.stringify(log?.metadata)).not.toContain('99999');
  });
  it('recusa: outra unidade, Caixa, nome curto, telefone sem DDD, cargo inativo, sem arquivo', async () => {
    expect(await encaminharCurriculo(gerB, novo({ phone: '31988880000' }))).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await encaminharCurriculo(caixa, novo({ phone: '31988880000' }))).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await encaminharCurriculo(gerA, novo({ candidateName: 'Maria', phone: '31988880000' }))).toMatchObject({ ok: false, reason: 'NOME' });
    expect(await encaminharCurriculo(gerA, novo({ phone: '99999-0000' }))).toMatchObject({ ok: false, reason: 'TELEFONE' });
    expect(await encaminharCurriculo(gerA, novo({ phone: '31988880000', jobTitleId: cargoInativoId }))).toMatchObject({ ok: false, reason: 'CARGO' });
    expect(await encaminharCurriculo(gerA, novo({ phone: '31988880000', attachmentPath: '' }))).toMatchObject({ ok: false, reason: 'SEM_ARQUIVO' });
  });
  it('o mesmo telefone para o mesmo cargo na mesma unidade, na semana, é duplicado', async () => {
    expect(await encaminharCurriculo(gerA, novo({ candidateName: 'Maria Silva' }))).toMatchObject({ ok: false, reason: 'DUPLICADO' });
  });
  it('escopo: o gerente da B não lê o currículo da A; a lista e os números são só os da unidade', async () => {
    expect(await getCurriculo(gerB, id)).toBeNull();
    expect((await listarCurriculos(gerB)).total).toBe(0);
    expect((await listarCurriculos(gerA)).total).toBe(1);
    expect((await listarCurriculos(gerA, { unitIds: [unitB] })).total).toBe(0); // a URL não vence o escopo
    expect((await indicadoresDosCurriculos(gerA)).recebidos).toBe(1);
    expect((await listarCurriculos(gerA, { q: 'maria' })).total).toBe(1);
    expect((await listarCurriculos(gerA, { q: '9999-0001' })).total).toBe(1);
    expect((await listarCurriculos(gerA, { faixa: 'entrevista' })).total).toBe(0);
  });

  describe('a situação só muda pelo evento do RH', () => {
    it('evento válido muda a situação, grava o histórico, marca a sincronização e avisa quem encaminhou', async () => {
      const r = await handleCurriculoSituacao({ sgoCurriculoId: id, situacao: 'entrevista_agendada', entrevistaEm: '2026-11-25T14:00:00-03:00', observacao: `Levar documento ${sfx}`, rhCandidatoId: `rh-${sfx}` });
      expect(r.httpStatus).toBe(200);
      const c = await getCurriculo(gerA, id);
      expect(c).toMatchObject({ status: 'ENTREVISTA_AGENDADA', rhCandidateId: `rh-${sfx}` });
      expect(c?.interviewAt?.toISOString()).toBe('2026-11-25T17:00:00.000Z');
      expect(c?.rhSyncedAt).toBeTruthy();
      expect(c?.events.map((e) => `${e.kind}:${e.toStatus}`)).toEqual(['ENCAMINHADO:RECEBIDO', 'SITUACAO:ENTREVISTA_AGENDADA']);
      const aviso = await prisma.notification.findFirst({ where: { userId: gerA.id, link: { contains: id } } });
      expect(aviso?.title).toBe('Currículo — Entrevista técnica');
      expect((await indicadoresDosCurriculos(gerA)).entrevista).toBe(1);
    });
    it('o mesmo evento de novo não duplica histórico nem aviso', async () => {
      const r = await handleCurriculoSituacao({ sgoCurriculoId: id, situacao: 'entrevista_agendada', entrevistaEm: '2026-11-25T14:00:00-03:00', observacao: `Levar documento ${sfx}` });
      expect(r.body).toMatchObject({ repetido: true });
      expect(await prisma.candidateResumeEvent.count({ where: { resumeId: id } })).toBe(2);
      expect(await prisma.notification.count({ where: { userId: gerA.id, link: { contains: id } } })).toBe(1);
    });
    it('casa também só pelo id do RH; contratado limpa a data da entrevista', async () => {
      const r = await handleCurriculoSituacao({ rhCandidatoId: `rh-${sfx}`, situacao: 'contratado' });
      expect(r.httpStatus).toBe(200);
      const c = await getCurriculo(gerA, id);
      expect(c).toMatchObject({ status: 'CONTRATADO', interviewAt: null, statusNote: null });
    });
    it('situação fora da lista = 400; currículo desconhecido = 404; nada muda', async () => {
      expect((await handleCurriculoSituacao({ sgoCurriculoId: id, situacao: `inventada ${sfx}` })).httpStatus).toBe(400);
      expect((await handleCurriculoSituacao({ sgoCurriculoId: `nao-existe-${sfx}`, situacao: 'aprovado' })).httpStatus).toBe(404);
      expect((await getCurriculo(gerA, id))?.status).toBe('CONTRATADO');
    });
  });

  describe('leitura pela API Global', () => {
    const req = (chave: string, qs = '') => new Request(`http://localhost/api/v1/curriculos${qs}`, { headers: { 'X-API-Key': chave } });
    it('chave comum recebe 403; liberada, lê nome, telefone, cargo, situação e o endereço do arquivo', async () => {
      const k = await criarChave(admin, { name: `RH ${sfx}` });
      if (!k.ok) throw new Error('chave');
      chaves.push(k.id);
      expect((await listaV1(req(k.chave))).status).toBe(403);
      expect(await definirLeituraDeCurriculos(gerA, k.id, true)).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
      expect(await definirLeituraDeCurriculos(admin, k.id, true)).toEqual({ ok: true });
      const res = await listaV1(req(k.chave, `?unidade=${unitA}`));
      expect(res.status).toBe(200);
      const j = await res.json();
      expect(j.total).toBe(1);
      expect(j.dados[0]).toMatchObject({
        sgoCurriculoId: id, candidato: { nome: 'Maria da Silva', telefone: '31999990001' }, cargoPretendido: `Cargo ${sfx}`,
        situacao: 'contratado', arquivo: { tipo: 'application/pdf', url: `/api/v1/curriculos/${id}/anexo` },
      });
      expect((await listaV1(req(k.chave, '?situacao=xpto'))).status).toBe(400);
      expect(await definirLeituraDeCurriculos(admin, k.id, false)).toEqual({ ok: true });
      expect((await listaV1(req(k.chave))).status).toBe(403);
    });
    it('sem chave: 401', async () => {
      expect((await listaV1(new Request('http://localhost/api/v1/curriculos'))).status).toBe(401);
    });
  });
});
