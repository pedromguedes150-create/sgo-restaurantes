import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { alterarChave, autenticarApiKey, criarChave, registrarChamada } from '@/lib/api-global/chaves';
import { comApiKey } from '@/lib/api-global/guarda';
import { GET as statusGet } from '@/app/api/v1/status/route';
import type { SessionUser } from '@/lib/auth/session';

/**
 * API GLOBAL DO SGO (v1.129.0): uma chave por sistema, hash no banco,
 * X-API-Key na chamada, 401 sem chave, registro de cada chamada sem a chave.
 */

const sfx = `apig${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let adminId: string, supId: string;
const ids: string[] = [];
const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [], seesAllUnits: false, needsTerms: false });

const req = (chave?: string, path = '/api/v1/status') =>
  new Request(`http://localhost${path}`, { headers: chave ? { 'X-API-Key': chave } : {} });

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: 'Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
});

afterAll(async () => {
  await prisma.apiRequestLog.deleteMany({ where: { OR: [{ clientId: { in: ids } }, { clientName: `nao autenticado ${sfx}` }] } });
  await prisma.apiClient.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supId] } } });
  await prisma.$disconnect();
});

describe('chaves por sistema', () => {
  it('só Admin/CEO cria; a chave sai UMA vez e no banco fica o hash', async () => {
    expect((await criarChave(sup(), { name: 'BI' })).ok).toBe(false);
    expect((await criarChave(admin(), { name: 'x' })).ok).toBe(false); // nome curto

    const r = await criarChave(admin(), { name: `Financeiro ${sfx}`, description: 'contas a pagar' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.push(r.id);
    expect(r.chave.startsWith('sgo_live_')).toBe(true);
    expect(r.chave.length).toBeGreaterThan(50);

    const row = await prisma.apiClient.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.keyHash).not.toContain(r.chave);
    expect(row.keyHash).toHaveLength(64);
    expect(row.keyPrefix + row.keyLast4).not.toBe(r.chave);
    expect(r.chave.startsWith(row.keyPrefix) && r.chave.endsWith(row.keyLast4)).toBe(true);

    const log = await prisma.auditLog.findFirst({ where: { action: 'API_KEY_CREATE', entityId: r.id } });
    expect(JSON.stringify(log?.metadata)).not.toContain(r.chave);
  });

  it('autentica a chave certa, recusa errada/ausente, e atualiza o último uso', async () => {
    const r = await criarChave(admin(), { name: `RH ${sfx}` });
    if (!r.ok) throw new Error('setup');
    ids.push(r.id);

    const ok = await autenticarApiKey(req(r.chave));
    expect(ok).toEqual({ ok: true, client: { id: r.id, name: `RH ${sfx}` } });
    expect((await autenticarApiKey(req())).ok).toBe(false);
    expect((await autenticarApiKey(req(r.chave.slice(0, -1) + 'Z'))).ok).toBe(false);
    expect((await autenticarApiKey(req('Bearer ' + r.chave))).ok).toBe(false);

    await new Promise((res) => setTimeout(res, 150)); // o lastUsedAt é gravado sem esperar
    expect((await prisma.apiClient.findUniqueOrThrow({ where: { id: r.id } })).lastUsedAt).not.toBeNull();
  });

  it('desativada não entra; reativada entra; revogada nunca mais (nem volta a ativar)', async () => {
    const r = await criarChave(admin(), { name: `Estoque ${sfx}` });
    if (!r.ok) throw new Error('setup');
    ids.push(r.id);

    expect((await alterarChave(sup(), r.id, 'desativar')).ok).toBe(false);
    expect((await alterarChave(admin(), r.id, 'desativar')).ok).toBe(true);
    expect((await autenticarApiKey(req(r.chave))).ok).toBe(false);
    expect((await alterarChave(admin(), r.id, 'ativar')).ok).toBe(true);
    expect((await autenticarApiKey(req(r.chave))).ok).toBe(true);
    expect((await alterarChave(admin(), r.id, 'revogar')).ok).toBe(true);
    expect((await autenticarApiKey(req(r.chave))).ok).toBe(false);
    const volta = await alterarChave(admin(), r.id, 'ativar');
    expect(volta).toMatchObject({ ok: false, reason: 'STATE' });
    expect(await prisma.auditLog.count({ where: { entityId: r.id, action: { in: ['API_KEY_DESATIVAR', 'API_KEY_ATIVAR', 'API_KEY_REVOGAR'] } } })).toBe(3);
  });
});

describe('GET /api/v1/status', () => {
  it('sem chave → 401; com chave → {status, service, api_version}; as duas chamadas registradas sem a chave', async () => {
    const r = await criarChave(admin(), { name: `Compras ${sfx}` });
    if (!r.ok) throw new Error('setup');
    ids.push(r.id);

    const negado = await statusGet(req());
    expect(negado.status).toBe(401);

    const ok = await statusGet(req(r.chave));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'ok', service: 'SGO', api_version: 'v1' });

    const logs = await prisma.apiRequestLog.findMany({ where: { clientId: r.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ clientName: `Compras ${sfx}`, method: 'GET', path: '/api/v1/status', status: 200 });
    expect(JSON.stringify(logs[0])).not.toContain(r.chave.slice(9));
    const semChave = await prisma.apiRequestLog.findFirst({ where: { clientId: null, path: '/api/v1/status', status: 401 }, orderBy: { createdAt: 'desc' } });
    expect(semChave?.clientName).toBe('não autenticado');
  });

  it('comApiKey embrulha qualquer handler: erro dentro vira 500 registrado, e o handler recebe o sistema', async () => {
    const r = await criarChave(admin(), { name: `BI ${sfx}` });
    if (!r.ok) throw new Error('setup');
    ids.push(r.id);
    const eco = comApiKey(async (_req, cliente) => Response.json({ sistema: cliente.name }));
    expect(await (await eco(req(r.chave, '/api/v1/eco'))).json()).toEqual({ sistema: `BI ${sfx}` });
    const quebra = comApiKey(async () => { throw new Error('boom'); });
    expect((await quebra(req(r.chave, '/api/v1/quebra'))).status).toBe(500);
    const logs = await prisma.apiRequestLog.findMany({ where: { clientId: r.id }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => [l.path, l.status])).toEqual([['/api/v1/eco', 200], ['/api/v1/quebra', 500]]);
  });

  it('a integração antiga do RH continua com o token próprio: a chave da API Global NÃO abre /api/integracoes', async () => {
    const { inboundAuthorized } = await import('@/lib/rh/inbound');
    const r = await criarChave(admin(), { name: `Outro ${sfx}` });
    if (!r.ok) throw new Error('setup');
    ids.push(r.id);
    expect(inboundAuthorized(new Request('http://localhost/api/integracoes/rh/inclusao', { headers: { 'x-api-key': r.chave } }))).toBe(false);
    await registrarChamada({ clientId: null, clientName: `nao autenticado ${sfx}`, method: 'GET', path: '/x', status: 401, durationMs: 1, ip: null });
  });
});
