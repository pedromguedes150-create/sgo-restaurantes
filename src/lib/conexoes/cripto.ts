import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifra das credenciais das conexões externas (v1.131.0) — AES-256-GCM.
 *
 * Por que cifra e não hash: a chave da API Global é NOSSA e só precisa ser
 * conferida (hash basta). A credencial de uma conexão externa é DELES e precisa
 * sair inteira no header de cada chamada — então tem de ser recuperável.
 *
 * A chave de cifra fica FORA do banco: `CONNECTIONS_ENC_KEY` no `.env`. Vazar o
 * banco não vaza as credenciais. Sem a variável, o sistema deriva uma chave de
 * `JWT_REFRESH_SECRET` (que todo servidor já tem) para a Central funcionar no
 * dia da subida sem mexer no `.env` do droplet — e a tela avisa que é derivada,
 * porque trocar o segredo do JWT nesse caso inutiliza as credenciais guardadas.
 *
 * Formato do que vai ao banco: `v1:<iv>:<tag>:<ciphertext>` em base64url. O
 * prefixo de versão existe para uma troca de algoritmo não quebrar o que já
 * está gravado.
 */

const VERSAO = 'v1';
const ALGO = 'aes-256-gcm';

export type OrigemDaChave = 'dedicada' | 'derivada' | 'nenhuma';

export function origemDaChave(): OrigemDaChave {
  if (process.env.CONNECTIONS_ENC_KEY) return 'dedicada';
  if (process.env.JWT_REFRESH_SECRET) return 'derivada';
  return 'nenhuma';
}

export function cifraConfigurada(): boolean {
  return origemDaChave() !== 'nenhuma';
}

export class SemChaveDeCifraError extends Error {
  constructor() {
    super('Sem chave de cifra: defina CONNECTIONS_ENC_KEY no .env do servidor.');
    this.name = 'SemChaveDeCifraError';
  }
}

/** 32 bytes derivados do segredo — qualquer tamanho de segredo vira chave AES-256. */
function chave(): Buffer {
  const dedicada = process.env.CONNECTIONS_ENC_KEY;
  if (dedicada) return createHash('sha256').update(`conexoes:${dedicada}`).digest();
  const derivada = process.env.JWT_REFRESH_SECRET;
  if (derivada) return createHash('sha256').update(`conexoes-derivada:${derivada}`).digest();
  throw new SemChaveDeCifraError();
}

export function cifrar(texto: string): string {
  const k = chave();
  const iv = randomBytes(12);
  const c = createCipheriv(ALGO, k, iv);
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return [VERSAO, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join(':');
}

export class CifraInvalidaError extends Error {
  constructor() {
    super('Credencial gravada não pôde ser decifrada (chave de cifra trocada ou registro corrompido). Cadastre a credencial de novo.');
    this.name = 'CifraInvalidaError';
  }
}

export function decifrar(blob: string): string {
  const partes = String(blob ?? '').split(':');
  if (partes.length !== 4 || partes[0] !== VERSAO) throw new CifraInvalidaError();
  const [, ivB, tagB, ctB] = partes;
  try {
    const d = createDecipheriv(ALGO, chave(), Buffer.from(ivB, 'base64url'));
    d.setAuthTag(Buffer.from(tagB, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ctB, 'base64url')), d.final()]).toString('utf8');
  } catch (e) {
    if (e instanceof SemChaveDeCifraError) throw e;
    throw new CifraInvalidaError();
  }
}
