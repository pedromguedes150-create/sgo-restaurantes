import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A ROTA /uploads (v1.171.1): `?w=320` entrega a derivada webp pequena;
 * sem `w` o original; PDF ignora `w`; `_derivadas` não é alcançável direto;
 * cache longo porque o nome do arquivo carrega o tamanho em bytes.
 */
let sessao: SessionUser | null = { id: 'u1', name: 'Gerente', role: 'MANAGER', unitIds: ['x'], seesAllUnits: false, needsTerms: false };
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionUser: async () => sessao,
}));

const sfx = `rot${process.pid.toString(36)}`;
const dir = path.join(process.cwd(), 'uploads', sfx);

async function get(p: string) {
  const { GET } = await import('@/app/uploads/[...path]/route');
  const segs = p.split('?')[0].split('/').filter(Boolean);
  return GET(new Request(`http://localhost${p}`), { params: { path: segs } });
}

beforeAll(async () => {
  await mkdir(dir, { recursive: true });
  const { default: sharp } = await import('sharp');
  await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 30, g: 90, b: 160 }, noise: { type: 'gaussian', mean: 128, sigma: 50 } } })
    .jpeg({ quality: 92 }).toFile(path.join(dir, 'a-1.jpg'));
});

afterAll(async () => {
  const { removerDerivadas } = await import('@/lib/uploads-derivadas');
  await removerDerivadas([sfx, 'a-1.jpg']);
  await rm(dir, { recursive: true, force: true });
});

describe('GET /uploads', () => {
  it('sem sessão: 401', async () => {
    sessao = null;
    expect((await get(`/uploads/${sfx}/a-1.jpg`)).status).toBe(401);
    sessao = { id: 'u1', name: 'Gerente', role: 'MANAGER', unitIds: ['x'], seesAllUnits: false, needsTerms: false };
  });

  it('sem w: o original, jpeg, com cache longo; com w=320: webp bem menor', async () => {
    const original = await stat(path.join(dir, 'a-1.jpg'));
    const r = await get(`/uploads/${sfx}/a-1.jpg`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    expect(Number(r.headers.get('content-length'))).toBe(original.size);
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect((await r.arrayBuffer()).byteLength).toBe(original.size);

    const mini = await get(`/uploads/${sfx}/a-1.jpg?w=320`);
    expect(mini.status).toBe(200);
    expect(mini.headers.get('content-type')).toBe('image/webp');
    const bytes = (await mini.arrayBuffer()).byteLength;
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(original.size / 10);
  });

  it('w fora da lista cai no original; derivadas não são alcançáveis pelo caminho; arquivo inexistente é 404', async () => {
    const r = await get(`/uploads/${sfx}/a-1.jpg?w=999`);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    expect((await get(`/uploads/_derivadas/qualquer.webp`)).status).toBe(400);
    expect((await get(`/uploads/${sfx}/nao-existe.jpg?w=320`)).status).toBe(404);
  });
});
