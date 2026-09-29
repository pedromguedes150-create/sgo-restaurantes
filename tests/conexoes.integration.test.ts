import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { criarConexao, editarConexao, alterarConexao, testarConexao, listarConexoes } from '@/lib/conexoes/conexoes';
import { chamarConexao, ConexaoIndisponivelError } from '@/lib/conexoes/cliente';
import { decifrar } from '@/lib/conexoes/cripto';
import { autenticarApiKey } from '@/lib/api-global/chaves';
import { inboundAuthorized } from '@/lib/rh/inbound';
import type { SessionUser } from '@/lib/auth/session';

/**
 * CONEXÕES COM OUTROS SISTEMAS (v1.131.0): as APIs que ESTE SGO consome,
 * administradas pela Central — credencial cifrada e recuperável só no
 * servidor, log de cada chamada de saída sem a credencial, e ZERO cruzamento
 * com a API Global (quem consome o SGO) e com os canais do RH.
 */

process.env.CONNECTIONS_ENC_KEY ||= 'chave-de-teste-das-conexoes';

const sfx = `cx${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let adminId: string; let supId: string;
const ids: string[] = [];
const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [], seesAllUnits: false, needsTerms: false });

const CREDENCIAL = `rh-v2-${sfx}-SEGREDO-9f8e7d6c`;
const base = () => ({ name: `SGO RH v2 ${sfx}`, purpose: 'teste', baseUrl: 'https://rh.exemplo.com/api/ext/v2/rh/', authType: 'API_KEY_HEADER' as const, credential: CREDENCIAL, testPath: '/recursos' });

/** Um `fetch` de mentira que devolve o que recebeu — para conferir header e URL sem sair para a rede. */
const visto: { url: string; headers: Record<string, string> }[] = [];
const fetchFalso = (resposta: { status: number; body: unknown }): typeof fetch => (async (url: string | URL | Request, init?: RequestInit) => {
  visto.push({ url: String(url), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)) });
  return new Response(JSON.stringify(resposta.body), { status: resposta.status, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: 'Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
});

afterAll(async () => {
  await prisma.externalRequestLog.deleteMany({ where: { OR: [{ connectionId: { in: ids } }, { connectionName: { contains: sfx } }] } });
  await prisma.externalConnection.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supId] } } });
  await prisma.$disconnect();
});

describe('cadastro', () => {
  it('só Admin/CEO cria; a credencial vai CIFRADA e o servidor a recupera; a lista não a devolve', async () => {
    expect((await criarConexao(sup(), base())).ok).toBe(false);
    const semUrl = await criarConexao(admin(), { ...base(), baseUrl: 'http://rh.exemplo.com' });
    expect(semUrl.ok).toBe(false);
    const semChave = await criarConexao(admin(), { ...base(), credential: 'curta' });
    expect(semChave.ok).toBe(false);

    const r = await criarConexao(admin(), base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.push(r.id);
    const row = await prisma.externalConnection.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.credentialEnc).not.toContain('SEGREDO');
    expect(row.credentialEnc.startsWith('v1:')).toBe(true);
    expect(await decifrar(row.credentialEnc)).toBe(CREDENCIAL);
    expect(row.credentialLast4).toBe(CREDENCIAL.slice(-4));
    expect(row.baseUrl).toBe('https://rh.exemplo.com/api/ext/v2/rh'); // sem a barra do fim

    const lista = await listarConexoes();
    const dto = lista.find((c) => c.id === r.id)!;
    expect(dto.credentialLast4).toBe(CREDENCIAL.slice(-4));
    expect(JSON.stringify(dto)).not.toContain('SEGREDO');
    expect(JSON.stringify(dto)).not.toContain('credentialEnc');
  });

  it('editar sem credencial mantém a atual; com credencial, troca', async () => {
    const id = ids[0];
    const e1 = await editarConexao(admin(), id, { ...base(), credential: '', purpose: 'colaboradores e empresas' });
    expect(e1.ok).toBe(true);
    let row = await prisma.externalConnection.findUniqueOrThrow({ where: { id } });
    expect(await decifrar(row.credentialEnc)).toBe(CREDENCIAL);
    expect(row.purpose).toBe('colaboradores e empresas');

    const e2 = await editarConexao(admin(), id, { ...base(), credential: `nova-${sfx}-TROCADA-1234` });
    expect(e2.ok).toBe(true);
    row = await prisma.externalConnection.findUniqueOrThrow({ where: { id } });
    expect(await decifrar(row.credentialEnc)).toBe(`nova-${sfx}-TROCADA-1234`);
    expect(row.credentialLast4).toBe('1234');
    // volta para a original, que os próximos casos conferem no header
    await editarConexao(admin(), id, { ...base() });
  });
});

describe('chamadas de saída', () => {
  it('a credencial sai no header configurado; o log guarda sistema/caminho/status/duração — a credencial, nunca', async () => {
    const id = ids[0];
    visto.length = 0;
    const r = await testarConexao(admin(), { id }, {}, { fetchImpl: fetchFalso({ status: 200, body: { data: [{ nome: 'Empresa', cnpj: '00' }] } }) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.teste.ok).toBe(true);
    expect(r.teste.status).toBe(200);
    expect(r.teste.forma).toEqual({ tipo: 'lista', chaves: ['nome', 'cnpj'], itens: 1 });
    expect(visto[0].url).toBe('https://rh.exemplo.com/api/ext/v2/rh/recursos');
    expect(visto[0].headers['x-api-key']).toBe(CREDENCIAL);

    const log = await prisma.externalRequestLog.findFirst({ where: { connectionId: id }, orderBy: { createdAt: 'desc' } });
    expect(log?.path).toBe('/recursos');
    expect(log?.status).toBe(200);
    expect(log?.ok).toBe(true);
    expect(JSON.stringify(log)).not.toContain('SEGREDO');
    const row = await prisma.externalConnection.findUniqueOrThrow({ where: { id } });
    expect(row.lastOk).toBe(true);
    expect(row.lastStatus).toBe(200);
    expect(row.lastUsedAt).not.toBeNull();
  });

  it('falha (401) vira último resultado com a mensagem do outro sistema, sem lançar', async () => {
    const id = ids[0];
    const r = await testarConexao(admin(), { id, path: '/colaboradores' }, {}, { fetchImpl: fetchFalso({ status: 401, body: { error: 'Não autorizado' } }) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.teste.ok).toBe(false);
    expect(r.teste.status).toBe(401);
    expect(r.teste.error).toBe('Não autorizado');
    expect(r.teste.forma).toBeNull();
    const row = await prisma.externalConnection.findUniqueOrThrow({ where: { id } });
    expect(row.lastOk).toBe(false);
    expect(row.lastResult).toBe('Não autorizado');
  });

  it('Bearer usa Authorization; o rascunho (antes de salvar) testa sem gravar conexão', async () => {
    visto.length = 0;
    const antes = await prisma.externalConnection.count();
    const r = await testarConexao(admin(), { rascunho: { ...base(), name: `Rascunho ${sfx}`, authType: 'BEARER', credential: `tok-${sfx}-BEARER-abcd` } }, {}, { fetchImpl: fetchFalso({ status: 200, body: { ok: true } }) });
    expect(r.ok && r.teste.ok).toBe(true);
    expect(visto[0].headers.Authorization).toBe(`Bearer tok-${sfx}-BEARER-abcd`);
    expect(await prisma.externalConnection.count()).toBe(antes);
    const log = await prisma.externalRequestLog.findFirst({ where: { connectionName: `Rascunho ${sfx} (não salva)` } });
    expect(log?.connectionId).toBeNull();
    expect(JSON.stringify(log)).not.toContain('BEARER-abcd');
  });

  it('desativada não é chamada; supervisor não testa', async () => {
    const id = ids[0];
    expect((await testarConexao(sup(), { id })).ok).toBe(false);
    expect((await alterarConexao(admin(), id, 'desativar')).ok).toBe(true);
    await expect(chamarConexao(id, { fetchImpl: fetchFalso({ status: 200, body: {} }) })).rejects.toThrow(ConexaoIndisponivelError);
    expect((await alterarConexao(admin(), id, 'ativar')).ok).toBe(true);
    const ok = await chamarConexao(id, { path: '/recursos', fetchImpl: fetchFalso({ status: 200, body: { data: [] } }) });
    expect(ok.ok).toBe(true);
  });
});

describe('separação das responsabilidades', () => {
  it('uma conexão externa não vira sistema da API Global nem abre a recepção do RH', async () => {
    expect(await prisma.apiClient.count({ where: { name: { contains: sfx } } })).toBe(0);
    const req = new Request('http://localhost/api/v1/status', { headers: { 'X-API-Key': CREDENCIAL } });
    expect((await autenticarApiKey(req)).ok).toBe(false);
    const inbound = new Request('http://localhost/api/integracoes/rh/inclusao', { headers: { authorization: `Bearer ${CREDENCIAL}` } });
    expect(inboundAuthorized(inbound)).toBe(false);
  });
});

describe('migração da cifra derivada → CONNECTIONS_ENC_KEY (v1.132.0)', () => {
  it('credencial cifrada com a chave derivada continua legível e é recifrada com a dedicada, sem perda', async () => {
    const { cifrar, decifrarDetalhado } = await import('@/lib/conexoes/cripto');
    const { migrarCredenciaisParaChaveDedicada, estadoDaCifra } = await import('@/lib/conexoes/conexoes');
    const dedicada = process.env.CONNECTIONS_ENC_KEY;
    // simula o mundo ANTES da chave própria: cifra com a derivada do JWT
    delete process.env.CONNECTIONS_ENC_KEY;
    process.env.JWT_REFRESH_SECRET ||= 'segredo-jwt-de-teste';
    const legado = await cifrar(`legado-${sfx}-SEGREDO`);
    process.env.CONNECTIONS_ENC_KEY = dedicada;

    const c = await prisma.externalConnection.create({ data: { name: `Legado ${sfx}`, baseUrl: 'https://legado.exemplo.com', credentialEnc: legado, credentialLast4: 'REDO' }, select: { id: true } });
    ids.push(c.id);
    expect(await decifrarDetalhado(legado)).toEqual({ texto: `legado-${sfx}-SEGREDO`, chave: 'derivada' });
    expect((await estadoDaCifra()).pendentesNaDerivada).toBeGreaterThanOrEqual(1);

    const m = await migrarCredenciaisParaChaveDedicada([c.id]); // só a própria linha: o banco de dev tem conexões de outra chave
    expect(m.origem).toBe('dedicada');
    expect(m.migradas).toBeGreaterThanOrEqual(1);
    const row = await prisma.externalConnection.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.credentialEnc).not.toBe(legado);
    expect(await decifrarDetalhado(row.credentialEnc)).toEqual({ texto: `legado-${sfx}-SEGREDO`, chave: 'dedicada' });

    // idempotente: rodar de novo não toca em nada
    const m2 = await migrarCredenciaisParaChaveDedicada([c.id]);
    expect(m2.migradas).toBe(0);
    expect((await estadoDaCifra()).pendentesNaDerivada).toBe(0);
  });
});
