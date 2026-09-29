import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { cifrar, cifraConfigurada, decifrar, CifraInvalidaError, SemChaveDeCifraError } from '@/lib/conexoes/cripto';
import { executarChamada, type ChamadaExterna } from '@/lib/conexoes/cliente';
import { resumirForma, type FormaDaResposta } from '@/lib/rh/v2-ping';
import {
  caminhoValido, headerValido, normalizarUrlBase, urlBaseValida, HEADER_PADRAO, type TipoDeAuth,
} from '@/lib/conexoes/formato';

export * from '@/lib/conexoes/formato';

type Ctx = { ip?: string | null; userAgent?: string | null };

/**
 * CONEXÕES COM OUTROS SISTEMAS (v1.131.0) — administração das APIs que este
 * SGO CONSOME. Só Admin/CEO mexe, como nas chaves da API Global.
 *
 * A credencial entra uma vez (criar ou editar), vai cifrada para o banco e
 * nunca volta inteira: a tela só vê os 4 últimos caracteres. Editar sem
 * informar credencial mantém a que está lá.
 */

const ADMINISTRA: readonly string[] = ['ADMIN', 'CEO'];
const TIPOS: readonly TipoDeAuth[] = ['API_KEY_HEADER', 'BEARER'];

export interface ConexaoDTO {
  id: string;
  name: string;
  purpose: string | null;
  baseUrl: string;
  authType: TipoDeAuth;
  authHeader: string;
  credentialLast4: string;
  active: boolean;
  testPath: string;
  lastUsedAt: string | null;
  lastStatus: number | null;
  lastOk: boolean | null;
  lastResult: string | null;
  createdAt: string;
  createdBy: string | null;
  chamadas: number;
}

/** A lista para a tela: SEM `credentialEnc`. O select é explícito para a coluna nunca escapar por um spread. */
export async function listarConexoes(): Promise<ConexaoDTO[]> {
  const rows = await prisma.externalConnection.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true, name: true, purpose: true, baseUrl: true, authType: true, authHeader: true, credentialLast4: true,
      active: true, testPath: true, lastUsedAt: true, lastStatus: true, lastOk: true, lastResult: true, createdAt: true,
      createdBy: { select: { name: true } }, _count: { select: { requests: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, purpose: r.purpose, baseUrl: r.baseUrl, authType: r.authType, authHeader: r.authHeader,
    credentialLast4: r.credentialLast4, active: r.active, testPath: r.testPath,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null, lastStatus: r.lastStatus, lastOk: r.lastOk, lastResult: r.lastResult,
    createdAt: r.createdAt.toISOString(), createdBy: r.createdBy?.name ?? null, chamadas: r._count.requests,
  }));
}

export async function ultimasChamadasExternas(take = 30) {
  return prisma.externalRequestLog.findMany({ orderBy: { createdAt: 'desc' }, take });
}

export interface EntradaDaConexao {
  name: string;
  purpose?: string | null;
  baseUrl: string;
  authType: TipoDeAuth;
  authHeader?: string | null;
  /** Obrigatória ao criar; ao editar, vazia = manter. */
  credential?: string | null;
  testPath?: string | null;
}

export type ResultadoDaConexao =
  | { ok: true; id: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'SEM_CIFRA'; detail?: string };

type Validado = { ok: true; data: { name: string; purpose: string | null; baseUrl: string; authType: TipoDeAuth; authHeader: string; testPath: string } } | { ok: false; detail: string };

function validar(input: EntradaDaConexao): Validado {
  const name = String(input.name ?? '').trim();
  if (name.length < 2 || name.length > 80) return { ok: false, detail: 'Informe o nome do sistema (2 a 80 caracteres).' };
  const baseUrl = normalizarUrlBase(input.baseUrl);
  if (!urlBaseValida(baseUrl)) return { ok: false, detail: 'URL base inválida: use https://… (http só para endereço local), sem ? nem #.' };
  const authType = input.authType;
  if (!TIPOS.includes(authType)) return { ok: false, detail: 'Tipo de autenticação inválido.' };
  const authHeader = String(input.authHeader ?? '').trim() || HEADER_PADRAO;
  if (authType === 'API_KEY_HEADER' && !headerValido(authHeader)) return { ok: false, detail: 'Nome do header inválido (letras, números e hífen).' };
  const testPath = String(input.testPath ?? '').trim() || '/';
  if (!caminhoValido(testPath)) return { ok: false, detail: 'Caminho de teste inválido: comece com / e não use ".." nem "//".' };
  const purpose = String(input.purpose ?? '').trim().slice(0, 300) || null;
  return { ok: true, data: { name, purpose, baseUrl, authType, authHeader: authType === 'BEARER' ? 'Authorization' : authHeader, testPath } };
}

function credencialValida(c: string): boolean {
  return c.length >= 8 && c.length <= 1000 && !/[\r\n]/.test(c);
}

export async function criarConexao(user: SessionUser, input: EntradaDaConexao, ctx: Ctx = {}): Promise<ResultadoDaConexao> {
  if (!ADMINISTRA.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!cifraConfigurada()) return { ok: false, reason: 'SEM_CIFRA', detail: new SemChaveDeCifraError().message };
  const v = validar(input);
  if (!v.ok) return { ok: false, reason: 'INVALID', detail: v.detail };
  const credential = String(input.credential ?? '').trim();
  if (!credencialValida(credential)) return { ok: false, reason: 'INVALID', detail: 'Informe a chave/token (mínimo 8 caracteres, sem quebra de linha).' };

  const c = await prisma.externalConnection.create({
    data: { ...v.data, credentialEnc: cifrar(credential), credentialLast4: credential.slice(-4), createdById: user.id },
    select: { id: true },
  });
  /* A auditoria guarda nome, URL e tipo — nunca a credencial. */
  await audit({ userId: user.id, action: 'EXT_CONN_CREATE', module: 'INTEGRATIONS', entity: 'external_connection', entityId: c.id, metadata: { name: v.data.name, baseUrl: v.data.baseUrl, authType: v.data.authType }, ...ctx });
  return { ok: true, id: c.id };
}

export async function editarConexao(user: SessionUser, id: string, input: EntradaDaConexao, ctx: Ctx = {}): Promise<ResultadoDaConexao> {
  if (!ADMINISTRA.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.externalConnection.findUnique({ where: { id }, select: { id: true, name: true, baseUrl: true, authType: true } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  const v = validar(input);
  if (!v.ok) return { ok: false, reason: 'INVALID', detail: v.detail };
  const credential = String(input.credential ?? '').trim();
  let credencialNova: { credentialEnc: string; credentialLast4: string } | null = null;
  if (credential) {
    if (!cifraConfigurada()) return { ok: false, reason: 'SEM_CIFRA', detail: new SemChaveDeCifraError().message };
    if (!credencialValida(credential)) return { ok: false, reason: 'INVALID', detail: 'Chave/token inválido (mínimo 8 caracteres, sem quebra de linha).' };
    credencialNova = { credentialEnc: cifrar(credential), credentialLast4: credential.slice(-4) };
  }
  await prisma.externalConnection.update({ where: { id }, data: { ...v.data, ...(credencialNova ?? {}) } });
  await audit({
    userId: user.id, action: 'EXT_CONN_UPDATE', module: 'INTEGRATIONS', entity: 'external_connection', entityId: id,
    metadata: { antes: { name: atual.name, baseUrl: atual.baseUrl, authType: atual.authType }, depois: { name: v.data.name, baseUrl: v.data.baseUrl, authType: v.data.authType }, credencialTrocada: Boolean(credencialNova) },
    ...ctx,
  });
  return { ok: true, id };
}

export type AcaoNaConexao = 'ativar' | 'desativar';

export async function alterarConexao(user: SessionUser, id: string, acao: AcaoNaConexao, ctx: Ctx = {}): Promise<ResultadoDaConexao> {
  if (!ADMINISTRA.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.externalConnection.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.externalConnection.update({ where: { id }, data: { active: acao === 'ativar' } });
  await audit({ userId: user.id, action: `EXT_CONN_${acao.toUpperCase()}`, module: 'INTEGRATIONS', entity: 'external_connection', entityId: id, metadata: { name: c.name }, ...ctx });
  return { ok: true, id };
}

export interface ResultadoDoTeste {
  ok: boolean;
  status: number | null;
  durationMs: number;
  error: string | null;
  /** Só a FORMA da resposta (tipo, nomes de campos, tamanho) — nunca valores. */
  forma: FormaDaResposta | null;
}

/** Alvo do teste: uma conexão gravada (`id`) ou os dados do formulário ainda não salvo. */
export type AlvoDoTeste = { id: string; path?: string | null } | { rascunho: EntradaDaConexao };

/**
 * "Testar conexão": GET no caminho de teste, com a credencial da conexão (ou a
 * digitada no formulário, antes de salvar). O que volta para a tela é status,
 * duração, erro e a FORMA da resposta — sem valores, porque a resposta de um RH
 * é PII. O teste de conexão gravada fica na Auditoria; o de rascunho, no log de
 * saída com o nome marcado "(não salva)".
 */
export async function testarConexao(
  user: SessionUser, alvo: AlvoDoTeste, ctx: Ctx = {}, opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; teste: ResultadoDoTeste } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'SEM_CIFRA'; detail?: string }> {
  if (!ADMINISTRA.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };

  let chamada: ChamadaExterna;
  if ('id' in alvo) {
    const c = await prisma.externalConnection.findUnique({ where: { id: alvo.id } });
    if (!c) return { ok: false, reason: 'NOT_FOUND' };
    const path = String(alvo.path ?? '').trim() || c.testPath;
    if (!caminhoValido(path)) return { ok: false, reason: 'INVALID', detail: 'Caminho de teste inválido.' };
    let credential: string;
    try { credential = decifrar(c.credentialEnc); } catch (e) {
      if (e instanceof SemChaveDeCifraError) return { ok: false, reason: 'SEM_CIFRA', detail: e.message };
      return { ok: false, reason: 'INVALID', detail: (e as CifraInvalidaError).message };
    }
    chamada = await executarChamada({ connectionId: c.id, connectionName: c.name, baseUrl: c.baseUrl, authType: c.authType, authHeader: c.authHeader, credential }, { path, fetchImpl: opts.fetchImpl });
    await audit({ userId: user.id, action: 'EXT_CONN_TEST', module: 'INTEGRATIONS', entity: 'external_connection', entityId: c.id, metadata: { name: c.name, path, status: chamada.status, ok: chamada.ok }, ...ctx });
  } else {
    const v = validar(alvo.rascunho);
    if (!v.ok) return { ok: false, reason: 'INVALID', detail: v.detail };
    const credential = String(alvo.rascunho.credential ?? '').trim();
    if (!credencialValida(credential)) return { ok: false, reason: 'INVALID', detail: 'Informe a chave/token para testar.' };
    chamada = await executarChamada({ connectionId: null, connectionName: `${v.data.name} (não salva)`, baseUrl: v.data.baseUrl, authType: v.data.authType, authHeader: v.data.authHeader, credential }, { path: v.data.testPath, fetchImpl: opts.fetchImpl });
  }

  return {
    ok: true,
    teste: { ok: chamada.ok, status: chamada.status, durationMs: chamada.durationMs, error: chamada.error, forma: chamada.ok ? resumirForma(chamada.data) : null },
  };
}
