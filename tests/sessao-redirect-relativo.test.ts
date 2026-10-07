import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { redirecionarRelativo } from '@/lib/http/redirecionar';

/**
 * 🔴 Relato do Pedro (print do iPhone, 07/10/2026): "Safari não pode abrir a
 * página — porta de rede restrita", endereço 0.0.0.0, toda manhã ao reabrir o SGO
 * deixado aberto. Em produção `req.url` numa rota de API é http://0.0.0.0:3100
 * (HOSTNAME do contêiner), e a renovação da sessão fazia
 * `NextResponse.redirect(new URL('/login', req.url))`. Confirmado em produção:
 * `Location: https://0.0.0.0:3100/login`.
 */
describe('renovação da sessão redireciona com Location RELATIVO', () => {
  it('o helper devolve Location relativo e recusa caminho externo', async () => {
    const r = redirecionarRelativo('/modulos/notas?x=1');
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toBe('/modulos/notas?x=1');
    expect(redirecionarRelativo('//evil.com').headers.get('location')).toBe('/dashboard');
    expect(redirecionarRelativo('https://evil.com').headers.get('location')).toBe('/dashboard');
  });

  it('a rota de refresh não monta URL absoluta a partir de req.url', () => {
    const src = readFileSync('src/app/api/auth/refresh/route.ts', 'utf8');
    expect(src).not.toMatch(/NextResponse\.redirect\(new URL\(/);
    expect(src).not.toContain("new URL('/login', req.url)");
    expect(src).toContain("redirecionarRelativo('/login')");
  });

  it('nenhuma rota de API monta redirect absoluto a partir de req.url', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const out = execSync('git grep -l "NextResponse.redirect(new URL(" -- src/app/api || true', { encoding: 'utf8' }).trim();
    expect(out).toBe('');
  });
});
