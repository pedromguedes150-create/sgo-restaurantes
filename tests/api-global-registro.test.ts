import { describe, it, expect } from 'vitest';
import { ENTIDADES, COMPUTADOS, TELAS_SEM_ENDPOINT, porSlug } from '@/lib/api-global/registro';
import { MODULES } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';

/**
 * O registro da API Global (v1.167.0) é a tabela "tela | tabela | endpoint".
 * Estes testes travam as duas direções e a lista do que NUNCA pode sair.
 */
const PROIBIDOS = /password|hash|token|secret|apikey|keyhash|cpf|pix|cid\b|salario|salary|payload|metadata|ip$|useragent/i;

describe('registro da API Global', () => {
  it('slug único e sem caractere fora de [a-z0-9-]', () => {
    const slugs = ENTIDADES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
    expect(porSlug.size).toBe(slugs.length);
    const computados = COMPUTADOS.map((c) => c.slug);
    expect(computados.some((c) => porSlug.has(c))).toBe(false);
  });

  it('nenhuma coluna proibida (senha, hash, token, chave, CPF, PIX, CID, metadados, IP)', () => {
    for (const e of ENTIDADES) {
      for (const c of e.campos) expect(c, `${e.slug}.${c}`).not.toMatch(PROIBIDOS);
      for (const k of Object.keys(e.extra ?? {})) expect(k, `${e.slug}.extra.${k}`).not.toMatch(PROIBIDOS);
      expect(JSON.stringify(e.extra ?? {}), `${e.slug}.extra`).not.toMatch(PROIBIDOS);
    }
  });

  it('toda tela citada existe na matriz', () => {
    const chaves = new Set(MODULES.map((m) => m.key));
    for (const e of ENTIDADES) for (const t of e.telas) expect(chaves.has(t), `${e.slug} → ${t}`).toBe(true);
    for (const c of COMPUTADOS) for (const t of c.telas) expect(chaves.has(t), `${c.slug} → ${t}`).toBe(true);
    for (const t of Object.keys(TELAS_SEM_ENDPOINT)) expect(chaves.has(t), `TELAS_SEM_ENDPOINT → ${t}`).toBe(true);
  });

  it('toda tela do MENU tem endpoint — ou razão escrita para não ter', () => {
    const cobertas = new Set([...ENTIDADES.flatMap((e) => e.telas), ...COMPUTADOS.flatMap((c) => [...c.telas])]);
    const noMenu = AREAS.flatMap((a) => a.colunas.flatMap((c) => c.keys));
    const semNada = noMenu.filter((k) => !cobertas.has(k) && !TELAS_SEM_ENDPOINT[k]);
    expect(semNada, `telas sem endpoint e sem motivo: ${semNada.join(', ')}`).toEqual([]);
  });

  it('o resumo sempre sabe de onde veio: tabela e descrição em toda entidade; período só com campo e tipo válidos', () => {
    for (const e of ENTIDADES) {
      expect(e.tabela.length, e.slug).toBeGreaterThan(2);
      expect(e.descricao.length, e.slug).toBeGreaterThan(10);
      if (e.periodo) {
        expect(['string', 'date', 'mes']).toContain(e.periodo.tipo);
        expect(e.campos, `${e.slug}: o campo do período precisa sair na lista`).toContain(e.periodo.campo);
      }
      for (const q of e.quebras ?? []) expect(e.campos, `${e.slug}: quebra ${q} fora dos campos`).toContain(q);
      for (const s of e.somas ?? []) expect(e.campos, `${e.slug}: soma ${s} fora dos campos`).toContain(s);
    }
  });
});
