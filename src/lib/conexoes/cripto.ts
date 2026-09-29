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
 * MIGRAÇÃO (v1.132.0): quando `CONNECTIONS_ENC_KEY` passa a existir, o que foi
 * cifrado com a chave derivada continua legível — `decifrar` tenta a dedicada
 * e, se não abrir, a derivada — e `migrarCredenciaisParaChaveDedicada` (em
 * conexoes.ts) recifra tudo com a dedicada. Idempotente: o que já está na
 * dedicada não é tocado.
 *
 * WebCrypto (`globalThis.crypto.subtle`), e não `node:crypto`, de propósito:
 * este módulo é alcançado pelo sync do RH, que a instrumentação importa, e a
 * instrumentação é compilada também para o bundle edge — onde `node:crypto`
 * não resolve. WebCrypto existe nos dois. O formato gravado é o mesmo que o
 * `node:crypto` produzia (AES-GCM padrão: o tag são os 16 bytes finais), então
 * o que já está no banco continua abrindo.
 *
 * Formato do que vai ao banco: `v1:<iv>:<tag>:<ciphertext>` em base64url. O
 * prefixo de versão existe para uma troca de algoritmo não quebrar o que já
 * está gravado.
 */

const VERSAO = 'v1';
const TAG_BYTES = 16;

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

export class CifraInvalidaError extends Error {
  constructor() {
    super('Credencial gravada não pôde ser decifrada (chave de cifra trocada ou registro corrompido). Cadastre a credencial de novo.');
    this.name = 'CifraInvalidaError';
  }
}

type ChaveConcreta = Exclude<OrigemDaChave, 'nenhuma'>;

const enc = new TextEncoder();
const dec = new TextDecoder();

/* base64url à mão: `Buffer` não existe no edge; `btoa`/`atob` existem nos dois. */
function paraB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 32 bytes derivados do segredo (SHA-256) — qualquer tamanho de segredo vira chave AES-256. */
async function chaveDe(origem: ChaveConcreta): Promise<CryptoKey | null> {
  const segredo = origem === 'dedicada' ? process.env.CONNECTIONS_ENC_KEY : process.env.JWT_REFRESH_SECRET;
  if (!segredo) return null;
  const material = enc.encode(origem === 'dedicada' ? `conexoes:${segredo}` : `conexoes-derivada:${segredo}`);
  const raw = await globalThis.crypto.subtle.digest('SHA-256', material);
  return globalThis.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function cifrar(texto: string): Promise<string> {
  const origem = origemDaChave();
  if (origem === 'nenhuma') throw new SemChaveDeCifraError();
  const key = (await chaveDe(origem))!;
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const saida = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(texto)));
  const ct = saida.slice(0, saida.length - TAG_BYTES);
  const tag = saida.slice(saida.length - TAG_BYTES);
  return [VERSAO, paraB64url(iv), paraB64url(tag), paraB64url(ct)].join(':');
}

async function abrirCom(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, tag: Uint8Array, ct: Uint8Array): Promise<string | null> {
  try {
    const junto = new Uint8Array(new ArrayBuffer(ct.length + tag.length));
    junto.set(ct, 0);
    junto.set(tag, ct.length);
    return dec.decode(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, junto as Uint8Array<ArrayBuffer>));
  } catch {
    return null;
  }
}

/**
 * Decifra e diz COM QUAL chave abriu — é o que permite migrar sem perder nada:
 * o que abre só com a derivada é o que ainda precisa ser recifrado.
 */
export async function decifrarDetalhado(blob: string): Promise<{ texto: string; chave: ChaveConcreta }> {
  if (origemDaChave() === 'nenhuma') throw new SemChaveDeCifraError();
  const partes = String(blob ?? '').split(':');
  if (partes.length !== 4 || partes[0] !== VERSAO) throw new CifraInvalidaError();
  let iv: Uint8Array<ArrayBuffer>, tag: Uint8Array, ct: Uint8Array;
  try { iv = deB64url(partes[1]); tag = deB64url(partes[2]); ct = deB64url(partes[3]); } catch { throw new CifraInvalidaError(); }
  for (const origem of ['dedicada', 'derivada'] as const) {
    const key = await chaveDe(origem);
    if (!key) continue;
    const texto = await abrirCom(key, iv, tag, ct);
    if (texto !== null) return { texto, chave: origem };
  }
  throw new CifraInvalidaError();
}

export async function decifrar(blob: string): Promise<string> {
  return (await decifrarDetalhado(blob)).texto;
}
