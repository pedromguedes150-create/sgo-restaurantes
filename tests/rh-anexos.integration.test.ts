import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { reenviarAnexosDosAtestados } from '@/lib/rh/saida/fila';
import { despacharPendentes } from '@/lib/rh/saida/despachante';
import { SISTEMA_DE_ORIGEM } from '@/lib/rh/saida/regras';
import { porSlug } from '@/lib/api-global/registro';
import { listar } from '@/lib/api-global/dados';
import { criarChave, alterarChave } from '@/lib/api-global/chaves';
import { GET as anexoGet } from '@/app/api/v1/atestados/[id]/anexo/route';

/**
 * Mensagem do RH (05/11/2026, v1.190.0): todo envio leva `sistema`; os atestados
 * com imagem voltam como `atualizar` (sgoEventId NOVO, mesmo sgoMovimentoId, anexo
 * no corpo); e a API de leitura devolve `fileUrl`, servido pela mesma X-API-Key.
 */
const sfx = `rha${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let unitId = ''; let adminId = ''; let gerenteId = ''; let collabId = ''; let certComFoto = ''; let certSemFoto = ''; let chave = ''; let clientId = '';
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: gerenteId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', `teste-${sfx}`);
const relPath = `uploads/teste-${sfx}/atestado.png`;

let ultima: { corpo: Record<string, unknown> } | null = null;
function rhResponde(status: number, body: unknown) {
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    ultima = { corpo: init?.body ? JSON.parse(String(init.body)) : {} };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
}

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `RHA-${sfx}`, name: `RH Anexos ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, cnpj: '42790781000105' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `adm-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Ger', email: `ger-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId } } } })).id;
  collabId = (await prisma.collaborator.create({ data: { name: `Ana ${sfx}`, cpf: '12345678945', active: true, hireDate: '2024-01-10', units: { create: [{ unitId }] } } })).id;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, 'atestado.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  /* dois atestados já ACEITOS pelo RH (criar ENVIADO): um com imagem, um sem */
  certComFoto = (await prisma.medicalCertificate.create({ data: { unitId, collaboratorId: collabId, type: 'FULL_DAY', startDate: '2026-11-03', endDate: '2026-11-04', days: 2, attachmentPath: relPath, createdById: gerenteId } })).id;
  certSemFoto = (await prisma.medicalCertificate.create({ data: { unitId, collaboratorId: collabId, type: 'FULL_DAY', startDate: '2026-10-20', endDate: '2026-10-20', days: 1, createdById: gerenteId } })).id;
  for (const id of [certComFoto, certSemFoto]) {
    await prisma.rhOutboundEvent.create({ data: { tipo: 'ATESTADO', acao: 'criar', referenceId: id, endpoint: '/x', payload: { sgoMovimentoId: id, acao: 'criar' }, status: 'ENVIADO', enviadoEm: new Date(), unitId } });
  }
  const k = await criarChave(admin(), { name: `RH teste ${sfx}` });
  if (!k.ok) throw new Error('chave');
  chave = k.chave; clientId = k.id;
  process.env.RH_WEBHOOK_TOKEN = 'token-de-teste'; process.env.RH_API_URL = 'https://rh-de-teste.local';
});
afterEach(() => { vi.unstubAllGlobals(); ultima = null; });
afterAll(async () => {
  delete process.env.RH_WEBHOOK_TOKEN;
  await alterarChave(admin(), clientId, 'revogar').catch(() => {});
  await prisma.apiRequestLog.deleteMany({ where: { clientId } }).catch(() => {});
  await prisma.apiClient.deleteMany({ where: { id: clientId } });
  await prisma.rhOutboundEvent.deleteMany({ where: { unitId } });
  await prisma.medicalCertificate.deleteMany({ where: { unitId } });
  await prisma.collaborator.deleteMany({ where: { id: collabId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, gerenteId] } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

describe('reenviar as imagens dos atestados como atualizar', () => {
  it('só Admin/CEO; cria um evento "atualizar" NOVO (sgoEventId próprio, mesmo sgoMovimentoId, anexo) para cada atestado COM imagem já enviado; sem imagem é contado e pulado', async () => {
    expect(await reenviarAnexosDosAtestados(gerente())).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    const r = await reenviarAnexosDosAtestados(admin());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.enfileirados).toBeGreaterThanOrEqual(1);
    const criar = await prisma.rhOutboundEvent.findFirst({ where: { referenceId: certComFoto, acao: 'criar' } });
    const atualizar = await prisma.rhOutboundEvent.findFirst({ where: { referenceId: certComFoto, acao: 'atualizar' } });
    expect(atualizar).toMatchObject({ status: 'PENDENTE', anexoPath: relPath, unitId });
    expect(atualizar!.sgoEventId).not.toBe(criar!.sgoEventId);
    expect(atualizar!.payload).toMatchObject({ sgoMovimentoId: certComFoto, acao: 'atualizar', cpf: '12345678945' });
    expect(await prisma.rhOutboundEvent.count({ where: { referenceId: certSemFoto, acao: 'atualizar' } })).toBe(0);
    /* segunda rodada: o atualizar ainda está PENDENTE → pulado, nada em dobro */
    const r2 = await reenviarAnexosDosAtestados(admin());
    expect(r2.ok && r2.enfileirados === 0).toBe(true);
    expect(await prisma.rhOutboundEvent.count({ where: { referenceId: certComFoto, acao: 'atualizar' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'RH_SAIDA_REENVIO_ANEXOS', userId: adminId } })).toBe(2);
  });

  it('o despacho manda o atualizar com "sistema": "SGO Restaurante" e o anexo em base64', async () => {
    rhResponde(200, { ok: true, atestado: { id: 'rh-1' } });
    const r = await despacharPendentes({ limite: 50, unitIds: [unitId] });
    expect(r.enviados).toBe(1);
    expect(SISTEMA_DE_ORIGEM).toBe('SGO Restaurante');
    expect(ultima?.corpo).toMatchObject({ sistema: 'SGO Restaurante', acao: 'atualizar', sgoMovimentoId: certComFoto });
    expect(ultima?.corpo.anexo).toMatchObject({ nome: 'atestado.png', conteudoBase64: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') });
    expect((await prisma.rhOutboundEvent.findFirst({ where: { referenceId: certComFoto, acao: 'atualizar' } }))?.status).toBe('ENVIADO');
  });
});

describe('API Global: fileUrl e o arquivo do atestado', () => {
  it('GET /api/v1/atestados devolve fileUrl (nulo sem anexo) e nunca o caminho interno', async () => {
    const e = porSlug.get('atestados')!;
    const r = await listar(e, { from: '2026-10-01', to: '2026-11-30' });
    const linhas = (r.dados as Record<string, unknown>[]).filter((l) => l.unitId === unitId);
    expect(linhas.find((l) => l.id === certComFoto)?.fileUrl).toBe(`/api/v1/atestados/${certComFoto}/anexo`);
    expect(linhas.find((l) => l.id === certSemFoto)?.fileUrl).toBeNull();
    expect(linhas.every((l) => !('attachmentPath' in l))).toBe(true);
  });

  it('GET /api/v1/atestados/{id}/anexo entrega o arquivo com a X-API-Key; 404 sem anexo; 401 sem chave', async () => {
    const req = (id: string, comChave = true) => new Request(`http://localhost/api/v1/atestados/${id}/anexo`, { headers: comChave ? { 'X-API-Key': chave } : {} });
    const ok = await anexoGet(req(certComFoto));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await ok.arrayBuffer()).toString('hex')).toBe('89504e470d0a1a0a');
    expect((await anexoGet(req(certSemFoto))).status).toBe(404);
    expect((await anexoGet(req(certComFoto, false))).status).toBe(401);
  });
});
