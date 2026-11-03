import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { CHAVE_DO_TOKEN } from '@/lib/rh/saida/config';
import { feriasWebhookConfigured, sendFeriasWebhook, tokenDoWebhookDeFerias } from '@/lib/rh/webhook';

/**
 * v1.183.1 — o webhook de férias sai com o MESMO token da fila de Envios ao RH
 * (o RH aceita esse token em /ferias); o `SGO_WEBHOOK_TOKEN` do `.env` é só reserva.
 */
const sfx = `wf${process.pid.toString(36)}`;
const TOKEN_DA_FILA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const envAntes = { fila: process.env.RH_WEBHOOK_TOKEN, legado: process.env.SGO_WEBHOOK_TOKEN };
const payload = { acao: 'criar' as const, movimento: 'PLANEJAMENTO' as const, colaborador: { nome: `Teste ${sfx}` }, inicio: '2026-12-01', fim: '2026-12-10', dias: 10, origem: 'SGO' as const };

let auth = ''; let chamadas = 0;
function rhResponde(status: number) {
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    chamadas++;
    auth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
    return new Response(JSON.stringify({ status: status < 300 ? 'processado' : 'erro' }), { status });
  });
}
async function ultimoRegistro() {
  return prisma.rhInboundEvent.findFirst({ where: { event: 'webhook_ferias_out', payload: { path: ['colaborador', 'nome'], equals: `Teste ${sfx}` } }, orderBy: { createdAt: 'desc' } });
}

beforeAll(async () => {
  delete process.env.RH_WEBHOOK_TOKEN; delete process.env.SGO_WEBHOOK_TOKEN;
  await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN } });
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.RH_WEBHOOK_TOKEN; delete process.env.SGO_WEBHOOK_TOKEN; auth = ''; chamadas = 0; });
afterAll(async () => {
  await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN } });
  await prisma.rhInboundEvent.deleteMany({ where: { event: 'webhook_ferias_out', payload: { path: ['colaborador', 'nome'], equals: `Teste ${sfx}` } } });
  if (envAntes.fila != null) process.env.RH_WEBHOOK_TOKEN = envAntes.fila;
  if (envAntes.legado != null) process.env.SGO_WEBHOOK_TOKEN = envAntes.legado;
});

describe('webhook de férias: o token da fila', () => {
  it('sem token em lugar nenhum: inerte (nenhuma chamada, nada registrado)', async () => {
    rhResponde(200);
    expect(await tokenDoWebhookDeFerias()).toEqual({ token: '', origem: 'nenhum' });
    expect(await feriasWebhookConfigured()).toBe(false);
    await sendFeriasWebhook(payload);
    expect(chamadas).toBe(0);
    expect(await ultimoRegistro()).toBeNull();
  });
  it('com o token da fila colado pela tela, o aviso sai com ELE — mesmo que o SGO_WEBHOOK_TOKEN antigo exista', async () => {
    await prisma.appSetting.create({ data: { key: CHAVE_DO_TOKEN, value: TOKEN_DA_FILA } });
    process.env.SGO_WEBHOOK_TOKEN = 'token-antigo-recusado-pelo-rh';
    expect(await tokenDoWebhookDeFerias()).toEqual({ token: TOKEN_DA_FILA, origem: 'fila' });
    rhResponde(200);
    await sendFeriasWebhook(payload);
    expect(chamadas).toBe(1);
    expect(auth).toBe(`Bearer ${TOKEN_DA_FILA}`);
    expect((await ultimoRegistro())?.status).toBe('PROCESSED');
  });
  it('o RH_WEBHOOK_TOKEN do .env vence o da tela, como na fila', async () => {
    process.env.RH_WEBHOOK_TOKEN = 'token-do-servidor-da-fila-xxxxxxxx';
    expect(await tokenDoWebhookDeFerias()).toEqual({ token: 'token-do-servidor-da-fila-xxxxxxxx', origem: 'fila' });
  });
  it('só sem token da fila o SGO_WEBHOOK_TOKEN antigo é usado; 401 fica registrado como erro', async () => {
    await prisma.appSetting.deleteMany({ where: { key: CHAVE_DO_TOKEN } });
    process.env.SGO_WEBHOOK_TOKEN = 'token-antigo-xxxxxxxxxxxx';
    expect(await tokenDoWebhookDeFerias()).toEqual({ token: 'token-antigo-xxxxxxxxxxxx', origem: 'SGO_WEBHOOK_TOKEN' });
    rhResponde(401);
    await sendFeriasWebhook(payload);
    expect(auth).toBe('Bearer token-antigo-xxxxxxxxxxxx');
    const r = await ultimoRegistro();
    expect(r?.status).toBe('ERROR');
    expect(r?.message).toContain('HTTP 401');
  });
});
