import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { ENTIDADES } from '@/lib/api-global/registro';
import { listar, resumir, lerFiltro, wherePeriodo } from '@/lib/api-global/dados';
import { GET as catalogo } from '@/app/api/v1/route';
import { GET as estrutura } from '@/app/api/v1/estrutura/route';
import { GET as lista } from '@/app/api/v1/[entidade]/route';
import { GET as resumo } from '@/app/api/v1/[entidade]/resumo/route';

/**
 * Cada entidade do registro é executada de verdade contra o banco: um nome de
 * coluna errado, uma relação inexistente ou um campo de período que não é
 * data quebram AQUI, não na primeira chamada do SGO Geral.
 */
describe('todas as entidades listam e resumem no banco', () => {
  for (const e of ENTIDADES) {
    it(`${e.slug}: lista paginada e resumo com cobertura e fonte`, async () => {
      const l = await listar(e, { page: 1, limit: 3 });
      expect(l.entidade).toBe(e.slug);
      expect(typeof l.total).toBe('number');
      expect(Array.isArray(l.dados)).toBe(true);
      expect((l.dados as unknown[]).length).toBeLessThanOrEqual(3);
      const r = await resumir(e, {});
      expect(r.total).toBe(l.total);
      expect(r.cobertura.registrosNoTotal).toBe(l.total);
      expect(r.fonte.startsWith(e.tabela)).toBe(true);
      if (e.periodo) expect(Array.isArray(r.porMes)).toBe(true);
      if (e.somas?.length) for (const s of e.somas) expect(r.somas, `${e.slug}.somas.${s}`).toHaveProperty(s);
      const texto = JSON.stringify([l, r]);
      expect(texto).not.toMatch(/passwordHash|keyHash|pixKey|"cpf"|"cid"/);
    });
  }
});

describe('período e paginação', () => {
  it('filtro por data em texto, data e mês', () => {
    const tarefas = ENTIDADES.find((e) => e.slug === 'tarefas')!;
    expect(wherePeriodo(tarefas, { from: '2026-10-01', to: '2026-10-31' })).toEqual({ operationalDate: { gte: '2026-10-01', lte: '2026-10-31' } });
    const auditoria = ENTIDADES.find((e) => e.slug === 'auditoria')!;
    const w = wherePeriodo(auditoria, { from: '2026-10-01', to: '2026-10-01' }) as { createdAt: { gte: Date; lt: Date } };
    expect(w.createdAt.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(w.createdAt.lt.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    const ticket = ENTIDADES.find((e) => e.slug === 'ticket-medio')!;
    expect(wherePeriodo(ticket, { from: '2026-09-15', to: '2026-10-02' })).toEqual({ competence: { gte: '2026-09', lte: '2026-10' } });
    const massas = ENTIDADES.find((e) => e.slug === 'pizzas-massas-recebimentos')!;
    expect(wherePeriodo(massas, {})).toEqual({ deletedAt: null });
  });
  it('limit tem teto 500 e piso 1; data inválida é ignorada', () => {
    expect(lerFiltro(new URL('http://x/api/v1/tarefas?limit=9999&page=0&from=ontem&to=2026-10-05'))).toEqual({ from: null, to: '2026-10-05', page: 1, limit: 500 });
    expect(lerFiltro(new URL('http://x/api/v1/tarefas'))).toEqual({ from: null, to: null, page: 1, limit: 100 });
  });
});

describe('as rotas exigem X-API-Key', () => {
  const sem = (p: string) => new Request(`http://localhost:3100${p}`);
  it('catálogo, estrutura, lista e resumo devolvem 401 em JSON sem a chave', async () => {
    for (const [fn, p] of [[catalogo, '/api/v1'], [estrutura, '/api/v1/estrutura'], [lista, '/api/v1/tarefas'], [resumo, '/api/v1/tarefas/resumo']] as const) {
      const res = await fn(sem(p));
      expect(res.status, p).toBe(401);
      expect((await res.json()).error).toBe('Não autorizado');
    }
  });
});
