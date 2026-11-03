import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { CHAVE_DO_TOKEN_DE_ENTRADA, definirTokenDeEntrada, inboundAutorizado, origemDoTokenDeEntrada, removerTokenDeEntrada, tokenDeEntrada } from '@/lib/rh/inbound-token';
import { inboundAuthorized } from '@/lib/rh/inbound';

/**
 * v1.183.0 — o token de ENTRADA do RH pela tela: o Admin cola o mesmo token que
 * está no painel do RH; a porta dos webhooks passa a aceitar o Bearer dele.
 * O `.env`, quando existe, vence.
 */
const sfx = `tin${process.pid.toString(36)}`;
const TOKEN = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
let admin: SessionUser; let gerente: SessionUser;
const envAntes = process.env.RH_INBOUND_TOKEN;
const req = (headers: Record<string, string>) => new Request('http://localhost/api/integracoes/rh/inclusao', { headers });

beforeAll(async () => {
  const a = await prisma.user.create({ data: { name: `Admin ${sfx}`, email: `a-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } });
  const g = await prisma.user.create({ data: { name: `Ger ${sfx}`, email: `g-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } });
  admin = { id: a.id, name: a.name, role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
  gerente = { id: g.id, name: g.name, role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false };
  delete process.env.RH_INBOUND_TOKEN;
  await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN_DE_ENTRADA } });
});
afterEach(() => { delete process.env.RH_INBOUND_TOKEN; });
afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN_DE_ENTRADA } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [admin.id, gerente.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, gerente.id] } } });
  if (envAntes != null) process.env.RH_INBOUND_TOKEN = envAntes;
});

describe('token de entrada pela tela', () => {
  it('sem token em lugar nenhum: origem "nenhum" e NINGUÉM entra, nem com Bearer vazio', async () => {
    expect(await origemDoTokenDeEntrada()).toBe('nenhum');
    expect(await inboundAutorizado(req({ authorization: 'Bearer ' }))).toBe(false);
    expect(await inboundAutorizado(req({ 'x-api-key': '' }))).toBe(false);
    expect(await inboundAuthorized(req({ authorization: `Bearer ${TOKEN}` }))).toBe(false);
  });
  it('gerente não grava; Admin grava (curto/com espaço recusado) e a Auditoria guarda só a máscara', async () => {
    expect(await definirTokenDeEntrada(gerente, TOKEN)).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await definirTokenDeEntrada(admin, 'curto')).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await definirTokenDeEntrada(admin, 'abcdefghijklmnop com espaco')).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await definirTokenDeEntrada(admin, `  ${TOKEN}  `)).toEqual({ ok: true, mascarado: 'fedcba…3210' });
    expect(await tokenDeEntrada()).toBe(TOKEN);
    expect(await origemDoTokenDeEntrada()).toBe('tela');
    const log = await prisma.auditLog.findFirst({ where: { userId: admin.id, action: 'RH_INBOUND_TOKEN_SET' } });
    expect(JSON.stringify(log?.metadata)).not.toContain(TOKEN);
    expect(JSON.stringify(log?.metadata)).toContain('fedcba…3210');
  });
  it('com o token da tela, a porta dos webhooks aceita Bearer e x-api-key iguais e recusa diferente', async () => {
    expect(await inboundAutorizado(req({ authorization: `Bearer ${TOKEN}` }))).toBe(true);
    expect(await inboundAutorizado(req({ 'x-api-key': TOKEN }))).toBe(true);
    expect(await inboundAuthorized(req({ authorization: `Bearer ${TOKEN}` }))).toBe(true); // a porta da rota é a mesma função
    expect(await inboundAutorizado(req({ authorization: `Bearer ${TOKEN.slice(0, -1)}x` }))).toBe(false);
    expect(await inboundAutorizado(req({ authorization: `Bearer ${TOKEN.slice(0, -1)}` }))).toBe(false); // tamanho diferente
    expect(await inboundAutorizado(req({ authorization: TOKEN }))).toBe(false); // sem "Bearer "
  });
  it('o .env, quando existe, VENCE o banco', async () => {
    process.env.RH_INBOUND_TOKEN = 'token-do-servidor-xxxxxxxx';
    expect(await tokenDeEntrada()).toBe('token-do-servidor-xxxxxxxx');
    expect(await origemDoTokenDeEntrada()).toBe('servidor');
    expect(await inboundAutorizado(req({ authorization: `Bearer ${TOKEN}` }))).toBe(false);
    expect(await inboundAutorizado(req({ authorization: 'Bearer token-do-servidor-xxxxxxxx' }))).toBe(true);
  });
  it('remover apaga e volta a "nenhum"', async () => {
    expect(await removerTokenDeEntrada(gerente)).toMatchObject({ ok: false });
    expect(await removerTokenDeEntrada(admin)).toMatchObject({ ok: true });
    expect(await origemDoTokenDeEntrada()).toBe('nenhum');
    expect(await inboundAutorizado(req({ authorization: `Bearer ${TOKEN}` }))).toBe(false);
  });
});
