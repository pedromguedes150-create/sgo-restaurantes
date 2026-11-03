import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { CHAVE_DO_TOKEN, mascararToken, origemDoToken, rhSaidaConfigurada, rhSaidaToken } from '@/lib/rh/saida/config';
import { definirTokenDoRh, removerTokenDoRh, testarTokenDoRh } from '@/lib/rh/saida/token';

/**
 * v1.182.2 — o token do RH pela tela: o Admin que não tem acesso ao servidor
 * cola o token em Envios ao RH; o `.env`, quando existe, vence; o teste de
 * conexão não cria nada no RH.
 */
const sfx = `tok${process.pid.toString(36)}`;
let admin: SessionUser; let gerente: SessionUser;
const envAntes = process.env.RH_WEBHOOK_TOKEN;

beforeAll(async () => {
  const a = await prisma.user.create({ data: { name: `Admin ${sfx}`, email: `a-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } });
  const g = await prisma.user.create({ data: { name: `Ger ${sfx}`, email: `g-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } });
  admin = { id: a.id, name: a.name, role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
  gerente = { id: g.id, name: g.name, role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false };
  delete process.env.RH_WEBHOOK_TOKEN;
  await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN } });
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.RH_WEBHOOK_TOKEN; });
afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [admin.id, gerente.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, gerente.id] } } });
  if (envAntes != null) process.env.RH_WEBHOOK_TOKEN = envAntes;
});

describe('token pela tela', () => {
  it('sem nada: não configurado, origem "nenhum", teste diz que falta token', async () => {
    expect(await rhSaidaConfigurada()).toBe(false);
    expect(await origemDoToken()).toBe('nenhum');
    expect((await testarTokenDoRh()).aceito).toBe(false);
  });
  it('gerente não grava; Admin grava (curto/com espaço recusado), a Auditoria guarda só a máscara, e o envio passa a ficar configurado', async () => {
    expect(await definirTokenDoRh(gerente, '0123456789abcdef0123456789abcdef')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await definirTokenDoRh(admin, 'curto')).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await definirTokenDoRh(admin, 'abcdefghijklmnop com espaco')).toMatchObject({ ok: false, reason: 'INVALID' });
    const r = await definirTokenDoRh(admin, '  0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  ');
    expect(r).toEqual({ ok: true, mascarado: '012345…cdef' });
    expect(await rhSaidaToken()).toBe('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    expect(await rhSaidaConfigurada()).toBe(true);
    expect(await origemDoToken()).toBe('tela');
    const log = await prisma.auditLog.findFirst({ where: { userId: admin.id, action: 'RH_WEBHOOK_TOKEN_SET' } });
    expect(JSON.stringify(log?.metadata)).not.toContain('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    expect(JSON.stringify(log?.metadata)).toContain('012345…cdef');
  });
  it('o .env, quando existe, VENCE o banco', async () => {
    process.env.RH_WEBHOOK_TOKEN = 'token-do-servidor-xxxxxxxx';
    expect(await rhSaidaToken()).toBe('token-do-servidor-xxxxxxxx');
    expect(await origemDoToken()).toBe('servidor');
  });
  it('o teste de conexão lê a resposta do RH: 401 = recusado; 400 "Required" = aceito; 503 = fora do ar — e manda o Bearer gravado', async () => {
    process.env.RH_API_URL = 'https://rh-de-teste.local';
    let auth = '';
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => { auth = String((init?.headers as Record<string, string>)?.Authorization ?? ''); return new Response(JSON.stringify({ status: 'erro', resultado: 'token inválido' }), { status: 401 }); });
    let t = await testarTokenDoRh();
    expect(t.aceito).toBe(false); expect(t.http).toBe(401);
    expect(auth).toBe('Bearer 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ status: 'erro', resultado: 'Required; Required' }), { status: 400 }));
    t = await testarTokenDoRh();
    expect(t.aceito).toBe(true); expect(t.http).toBe(400);
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
    expect((await testarTokenDoRh()).aceito).toBe(false);
  });
  it('remover apaga e volta a "nenhum"', async () => {
    expect(await removerTokenDoRh(gerente)).toMatchObject({ ok: false });
    expect(await removerTokenDoRh(admin)).toMatchObject({ ok: true });
    expect(await origemDoToken()).toBe('nenhum');
    expect(mascararToken('')).toBe('—');
  });
});
