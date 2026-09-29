import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { criarConexao, alterarConexao } from '@/lib/conexoes/conexoes';
import { resolverRh, rhGetCentral, listaParaUnidade, codificarSegmento, NOME_DO_FALLBACK, RhApiError } from '@/lib/rh/transporte';
import { caminhoValido } from '@/lib/conexoes/formato';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O RH PELA CENTRAL (v1.132.0): sync/diagnóstico usam a conexão cadastrada
 * (URL, header, credencial decifrada no servidor), cada chamada vai para
 * external_request_logs, e sem conexão ativa vale o fallback do .env — também
 * registrado, com nome próprio.
 */

process.env.CONNECTIONS_ENC_KEY ||= 'chave-de-teste-das-conexoes';

const sfx = `rht${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let adminId: string;
const ids: string[] = [];
const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const CRED = `rh-central-${sfx}-SEGREDO-4321`;

const visto: { url: string; headers: Record<string, string> }[] = [];
const fetchFalso = (status: number, body: unknown): typeof fetch => (async (url: string | URL | Request, init?: RequestInit) => {
  visto.push({ url: String(url), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)) });
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

let envBackup: { base?: string; key?: string };
/* Conexões do RH que já existam no banco (ex.: a de desenvolvimento) são
   desmarcadas durante o teste e restauradas no fim — senão a resolução as
   acharia e o caso do fallback não seria testável. */
let marcadasAntes: string[] = [];

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: 'Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  envBackup = { base: process.env.RH_API_BASE_URL, key: process.env.RH_API_KEY };
  /* Isola de qualquer conexão de dev que aponte para o host real do RH. */
  process.env.RH_API_BASE_URL = `https://rh-${sfx}.teste.local`;
  process.env.RH_API_KEY = `env-key-${sfx}`;
  marcadasAntes = (await prisma.externalConnection.findMany({ where: { systemKey: 'RH' }, select: { id: true } })).map((c) => c.id);
  if (marcadasAntes.length) await prisma.externalConnection.updateMany({ where: { id: { in: marcadasAntes } }, data: { systemKey: null } });
});

afterAll(async () => {
  process.env.RH_API_BASE_URL = envBackup.base;
  process.env.RH_API_KEY = envBackup.key;
  await prisma.externalRequestLog.deleteMany({ where: { OR: [{ connectionId: { in: ids } }, { connectionName: NOME_DO_FALLBACK }] } });
  if (marcadasAntes.length) await prisma.externalConnection.updateMany({ where: { id: { in: marcadasAntes } }, data: { systemKey: 'RH' } });
  await prisma.externalConnection.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe('resolução da conexão do RH', () => {
  it('sem conexão marcada nem com o host do RH → fallback .env, registrado com nome próprio', async () => {
    const r = await resolverRh();
    expect(r.origem).toBe('env');
    visto.length = 0;
    const data = await rhGetCentral<{ data: string[] }>('/api/ext/colaboradores/unidades', { fetchImpl: fetchFalso(200, { data: ['A'] }) });
    expect(data.data).toEqual(['A']);
    expect(visto[0].url).toBe(`https://rh-${sfx}.teste.local/api/ext/colaboradores/unidades`);
    expect(visto[0].headers['x-api-key']).toBe(`env-key-${sfx}`);
    const log = await prisma.externalRequestLog.findFirst({ where: { connectionName: NOME_DO_FALLBACK }, orderBy: { createdAt: 'desc' } });
    expect(log?.path).toBe('/api/ext/colaboradores/unidades');
    expect(log?.status).toBe(200);
  });

  it('conexão ativa com o MESMO host do RH é reconhecida sem papel; com papel RH vira explícita', async () => {
    const r1 = await criarConexao(admin(), { name: `RH host ${sfx}`, baseUrl: `https://rh-${sfx}.teste.local`, authType: 'API_KEY_HEADER', credential: CRED, testPath: '/api/ext/colaboradores' });
    expect(r1.ok).toBe(true); if (!r1.ok) return; ids.push(r1.id);
    let r = await resolverRh();
    expect(r.origem === 'conexao' && r.id === r1.id && r.marcada === false).toBe(true);

    const r2 = await criarConexao(admin(), { name: `RH papel ${sfx}`, baseUrl: `https://outro-${sfx}.teste.local`, authType: 'API_KEY_HEADER', credential: `${CRED}-2`, systemKey: 'RH' });
    expect(r2.ok).toBe(true); if (!r2.ok) return; ids.push(r2.id);
    r = await resolverRh();
    expect(r.origem === 'conexao' && r.id === r2.id && r.marcada === true).toBe(true);
  });

  it('a chamada usa URL, header e credencial DA CONEXÃO, registra no log dela e não expõe a credencial', async () => {
    visto.length = 0;
    const data = await rhGetCentral<{ data: unknown[] }>('/api/ext/colaboradores/unidade/CHURRASCARIA%20X', { fetchImpl: fetchFalso(200, { data: [{ matricula: '1' }] }) });
    expect(data.data).toHaveLength(1);
    expect(visto[0].url).toBe(`https://outro-${sfx}.teste.local/api/ext/colaboradores/unidade/CHURRASCARIA%20X`);
    expect(visto[0].headers['x-api-key']).toBe(`${CRED}-2`);
    const log = await prisma.externalRequestLog.findFirst({ where: { connectionId: ids[1] }, orderBy: { createdAt: 'desc' } });
    expect(log?.method).toBe('GET');
    expect(log?.path).toBe('/api/ext/colaboradores/unidade/CHURRASCARIA%20X');
    expect(log?.status).toBe(200);
    expect(log?.ok).toBe(true);
    expect(JSON.stringify(log)).not.toContain('SEGREDO');
  });

  it('falha do RH vira RhApiError com o status, como no cliente de sempre', async () => {
    await expect(rhGetCentral('/api/ext/colaboradores', { fetchImpl: fetchFalso(401, { success: false, error: 'Unauthorized' }) })).rejects.toThrow(RhApiError);
    const log = await prisma.externalRequestLog.findFirst({ where: { connectionId: ids[1] }, orderBy: { createdAt: 'desc' } });
    expect(log?.status).toBe(401);
    expect(log?.ok).toBe(false);
  });

  it('desativar as conexões devolve o fallback do .env', async () => {
    for (const id of ids) await alterarConexao(admin(), id, 'desativar');
    expect((await resolverRh()).origem).toBe('env');
    for (const id of ids) await alterarConexao(admin(), id, 'ativar');
  });
});

describe('lista para a unidade — CNPJ primeiro, razão social depois', () => {
  const colab = (m: string, cnpj: string | null, unidade: string) => ({ matricula: m, nome: `N${m}`, cpf: null, status: 'Ativo', unidade, unidade_cnpj: cnpj, cargo: null, admissao: null });
  const todos = [colab('1', '12.345.678/0001-90', 'A LTDA'), colab('2', '12345678000190', 'A LTDA'), colab('3', '99.999.999/0001-99', 'B LTDA')];

  it('com CNPJ cadastrado e correspondência: filtra a lista completa, ignora as outras empresas', async () => {
    const r = await listaParaUnidade({ cnpj: '12345678000190', rhUnitName: 'A LTDA' }, todos);
    expect(r.ok && r.vinculo === 'CNPJ' && r.lista.map((c) => c.matricula)).toEqual(['1', '2']);
  });

  it('CNPJ sem correspondência cai na razão social — filtrada da MESMA lista, sem nova chamada', async () => {
    const r = await listaParaUnidade({ cnpj: '11111111000111', rhUnitName: 'B LTDA' }, todos);
    expect(r.ok && r.vinculo === 'RAZAO_SOCIAL' && r.lista.map((c) => c.matricula)).toEqual(['3']);
  });

  it('o caminho por unidade, se alguém o usar, sai codificado à RFC 3986 e passa na validação da Central', () => {
    const seg = codificarSegmento('COMERCIAL LINS & GUEDES LTDA (CENTRO DE DISTRIBUIÇÃO)');
    expect(seg).not.toMatch(/[()& ]/);
    expect(caminhoValido(`/api/ext/colaboradores/unidade/${seg}`)).toBe(true);
    /* encodeURIComponent puro deixava "(" e ")" — era o "Caminho inválido" (503). */
    expect(caminhoValido(`/api/ext/colaboradores/unidade/${encodeURIComponent('X (Y)')}`)).toBe(false);
  });

  it('sem CNPJ nem razão social: SEM_VINCULO', async () => {
    const r = await listaParaUnidade({ cnpj: null, rhUnitName: null }, todos);
    expect(r).toEqual({ ok: false, reason: 'SEM_VINCULO' });
  });
});
