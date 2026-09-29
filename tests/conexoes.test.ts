import { describe, it, expect, beforeAll } from 'vitest';
import { cifrar, decifrar, origemDaChave, CifraInvalidaError } from '@/lib/conexoes/cripto';
import { urlBaseValida, normalizarUrlBase, caminhoValido, headerValido, mascararCredencial, textoDoResultado, descreverAuth } from '@/lib/conexoes/formato';

/**
 * CONEXÕES COM OUTROS SISTEMAS (v1.131.0) — a parte sem banco: cifra das
 * credenciais e as regras de formato que a tela e a rota compartilham.
 */

beforeAll(() => { process.env.CONNECTIONS_ENC_KEY ||= 'chave-de-teste-das-conexoes'; });

describe('cifra da credencial (AES-256-GCM)', () => {
  it('cifra e decifra; o que vai ao banco não contém o texto', async () => {
    const blob = await cifrar('sgo-rh-abc123XYZ');
    expect(blob.startsWith('v1:')).toBe(true);
    expect(blob).not.toContain('abc123');
    expect(await decifrar(blob)).toBe('sgo-rh-abc123XYZ');
  });
  it('dois cifrados do mesmo texto são diferentes (IV aleatório)', async () => {
    expect(await cifrar('mesma')).not.toBe(await cifrar('mesma'));
  });
  it('o formato é o mesmo que o node:crypto gravava (AES-GCM, tag nos 16 bytes finais): o que já está no banco abre', async () => {
    const { createCipheriv, createHash } = await import('node:crypto');
    const key = createHash('sha256').update(`conexoes:${process.env.CONNECTIONS_ENC_KEY}`).digest();
    const iv = Buffer.alloc(12, 7);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update('gravado-pelo-node', 'utf8'), c.final()]);
    const blob = ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
    expect(await decifrar(blob)).toBe('gravado-pelo-node');
  });
  it('blob adulterado ou de outra chave não decifra — erro claro, nunca lixo', async () => {
    const blob = await cifrar('segredo');
    const partes = blob.split(':');
    partes[3] = partes[3].slice(0, -2) + (partes[3].endsWith('AA') ? 'BB' : 'AA');
    await expect(decifrar(partes.join(':'))).rejects.toThrow(CifraInvalidaError);
    await expect(decifrar('lixo')).rejects.toThrow(CifraInvalidaError);
    const antes = process.env.CONNECTIONS_ENC_KEY;
    const jwt = process.env.JWT_REFRESH_SECRET;
    process.env.CONNECTIONS_ENC_KEY = 'outra-chave';
    delete process.env.JWT_REFRESH_SECRET; // senão a derivada seria tentada em seguida
    await expect(decifrar(blob)).rejects.toThrow(CifraInvalidaError);
    process.env.CONNECTIONS_ENC_KEY = antes;
    if (jwt) process.env.JWT_REFRESH_SECRET = jwt;
  });
  it('a origem da chave é informada (dedicada quando CONNECTIONS_ENC_KEY existe)', () => {
    expect(origemDaChave()).toBe('dedicada');
  });
});

describe('regras de formato', () => {
  it('URL base: https sim; http só local; sem query/hash; sem barra no fim', () => {
    expect(urlBaseValida('https://gbf-rh.replit.app/api/ext/v2/rh')).toBe(true);
    expect(urlBaseValida('https://gbf-rh.replit.app/api/ext/v2/rh/')).toBe(true);
    expect(normalizarUrlBase('https://x.com/api///')).toBe('https://x.com/api');
    expect(urlBaseValida('http://localhost:3100')).toBe(true);
    expect(urlBaseValida('http://exemplo.com')).toBe(false);
    expect(urlBaseValida('https://x.com/?a=1')).toBe(false);
    expect(urlBaseValida('ftp://x.com')).toBe(false);
    expect(urlBaseValida('')).toBe(false);
  });
  it('caminho: começa com /, sem .. nem //', () => {
    expect(caminhoValido('/recursos')).toBe(true);
    expect(caminhoValido('/colaboradores?unidade=x')).toBe(true);
    expect(caminhoValido('recursos')).toBe(false);
    expect(caminhoValido('/../etc')).toBe(false);
    expect(caminhoValido('//outra-origem')).toBe(false);
  });
  it('header: só letras, números e hífen', () => {
    expect(headerValido('x-api-key')).toBe(true);
    expect(headerValido('X-Auth-Token')).toBe(true);
    expect(headerValido('x api')).toBe(false);
    expect(headerValido('x:y\r\n')).toBe(false);
  });
  it('máscara e textos', () => {
    expect(mascararCredencial('f9k2')).toBe('••••••••f9k2');
    expect(descreverAuth('API_KEY_HEADER', 'x-api-key')).toBe('header x-api-key');
    expect(descreverAuth('BEARER', 'Authorization')).toBe('Authorization: Bearer');
    expect(textoDoResultado({ lastOk: null, lastStatus: null, lastResult: null, lastUsedAt: null })).toBe('Nunca usada');
    expect(textoDoResultado({ lastOk: true, lastStatus: 200, lastResult: null, lastUsedAt: null })).toBe('OK (200)');
    expect(textoDoResultado({ lastOk: false, lastStatus: 401, lastResult: 'Não autorizado', lastUsedAt: null })).toBe('Falha (401): Não autorizado');
  });
});
