import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { analisarRestaurante, type LinhaParaAnalise } from '@/lib/waste/restaurante-executivo';
import { ResumoRestaurante } from '@/components/waste/resumo-restaurante';
import { regraDaRota } from '@/lib/permissions/guarda-rota-api';

const linha = (nome: string, over: Partial<LinhaParaAnalise> = {}): LinhaParaAnalise => ({
  unitId: nome, unitName: nome,
  porCodigo: { SS_ALMOCO: 30, SS_JANTAR: 10, REF_ALMOCO: 0, REF_JANTAR: 0, PROD_ALMOCO: 40, PROD_JANTAR: 20 },
  sobraLimpa: 40, sobraProducao: 60, geral: 100,
  anterior: 80, diasComLancamento: 10, diasDecorridos: 20, diasAnterior: 10,
  ...over,
});
const R = { mes: 'novembro', anterior: 'outubro' };

describe('Sobras Restaurantes — leitura executiva (v1.226.0)', () => {
  it('total, média por dia lançado, cobertura e fatias por grupo, turno e tipo', () => {
    const a = analisarRestaurante([linha('A'), linha('B', { geral: 0, sobraLimpa: 0, sobraProducao: 0, porCodigo: {}, anterior: 0, diasComLancamento: 0, diasAnterior: 0 })], R);
    expect(a.total).toBe(100);
    expect(a.diasLancados).toBe(10);
    expect(a.diasEsperados).toBe(40);
    expect(a.cobertura).toBe(0.25);
    expect(a.mediaPorDia).toBe(10);
    expect([a.unidadesQueLancaram, a.unidadesNoEscopo]).toEqual([1, 2]);
    expect(a.porGrupo.map((g) => [g.kg, g.pct])).toEqual([[40, 40], [60, 60]]);
    expect(a.porTurno.map((t) => [t.nome, t.kg])).toEqual([['Almoço', 70], ['Jantar', 30]]);
    expect(a.porTipo.map((t) => t.kg)).toEqual([40, 30, 20, 10]); // os dois de refeitório, zerados, ficam fora
    expect(a.porUnidade.map((u) => [u.unitName, u.pct, u.media])).toEqual([['A', 100, 10], ['B', 0, null]]);
  });

  it('compara pela MÉDIA por dia lançado: total maior com média menor é queda', () => {
    const a = analisarRestaurante([linha('A', { geral: 200, diasComLancamento: 20, anterior: 60, diasAnterior: 4 })], R);
    expect(Math.round(a.variacaoDoTotal!)).toBe(233);
    expect(Math.round(a.variacaoDaMedia!)).toBe(-33); // 15 → 10 kg/dia
    expect(a.baseFraca).toBe(true);
    expect(a.porUnidade[0].variacaoDaMedia).toBeCloseTo(-33.3, 1);
    const texto = a.leituras.join(' | ');
    expect(texto).toContain('caiu');
    expect(texto).toContain('mais registro');
  });

  it('sem os dias do mês anterior não inventa média: fala do total e manda ler os dias', () => {
    const a = analisarRestaurante([linha('A', { diasAnterior: undefined })], R);
    expect(a.variacaoDaMedia).toBeNull();
    expect(a.anterior.diasLancados).toBeNull();
    expect(a.variacaoDoTotal).toBe(25);
    expect(a.leituras.join(' ')).toContain('leia junto com os dias lançados');
  });

  it('sem base no mês anterior não vira "+100%"; mês vazio diz que é falta de registro', () => {
    const a = analisarRestaurante([linha('A', { anterior: 0, diasAnterior: 0 })], R);
    expect(a.variacaoDoTotal).toBeNull();
    expect(a.variacaoDaMedia).toBeNull();
    const vazio = analisarRestaurante([linha('A', { geral: 0, sobraLimpa: 0, sobraProducao: 0, porCodigo: {}, diasComLancamento: 0 })], R);
    expect(vazio.leituras[0]).toContain('falta de registro');
    expect(vazio.mediaPorDia).toBeNull();
  });

  it('aponta quem lançou em menos da metade dos dias', () => {
    const a = analisarRestaurante([linha('A', { diasComLancamento: 18 }), linha('B', { diasComLancamento: 4 })], R);
    expect(a.leituras.join(' ')).toContain('B (4/20)');
    expect(a.leituras.join(' ')).not.toContain('A (18/20)');
  });

  it('a tela mostra a leitura, os números, as fatias e os downloads', () => {
    const a = analisarRestaurante([linha('A', { geral: 200, diasComLancamento: 20, anterior: 60, diasAnterior: 4 }), linha('B')], R);
    const h = renderToString(<ResumoRestaurante a={a} mes="novembro de 2026" anterior="outubro" acoes={<a data-testid="baixar-excel" href="/x">Excel</a>} />);
    for (const id of ['resumo-restaurante', 'leitura-executiva', 'kpi-total', 'kpi-media', 'kpi-variacao', 'kpi-cobertura', 'aviso-base-fraca', 'barras-grupo', 'barras-turno', 'barras-tipo', 'barras-unidades', 'baixar-excel']) {
      expect(h, id).toContain('data-testid="' + id + '"');
    }
  });

  it('a página usa o bloco, o PDF e o Excel; baixar exige só VER', () => {
    const pagina = readFileSync('src/app/(app)/modulos/desperdicios/consolidado/page.tsx', 'utf8');
    expect(pagina).toContain('<ResumoRestaurante');
    expect(pagina).toContain('/api/waste/consolidado/export?ano=');
    expect(regraDaRota('/api/waste/consolidado/export')).toMatchObject({ modulo: 'WASTE', exigir: 'ver' });
    expect(readFileSync('src/app/api/waste/consolidado/export/route.ts', 'utf8')).toContain('guardaDaRota(user.role, req)');
  });
});
