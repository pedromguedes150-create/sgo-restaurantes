import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/desperdicios/consolidado',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PainelConferencia } from '@/components/waste/painel-conferencia';
import { PainelPerformance } from '@/components/waste/painel-performance';

/**
 * Painel de desperdício (v1.152.0) na tela: a foto sai como miniatura no
 * endereço que o servidor serve (/uploads/…, nunca /api/uploads/…), o selo diz
 * se o lançamento tem foto, e a Performance dá o veredito subiu/caiu.
 */
const lanc = (over: Record<string, unknown> = {}) => ({
  id: 'x', unitId: 'u1', unitName: 'Beija Flor Centro', date: '2026-09-30', total: 21,
  linhas: [{ rotulo: 'Coxinha · Sobra do dia', valor: 6 }], fotos: [{ rotulo: 'Recipiente de descarte', path: 'uploads/u1/snack.jpg' }],
  foto: 'completa', faltamFotos: [], registradoPor: 'Ana', registradoEm: '30/09, 22:10', atualizadoEm: null, depois: false, observacao: null, ...over,
});
const conferencia = (lancamentos: ReturnType<typeof lanc>[]) => ({
  frente: 'salgados', year: 2026, month: 9, unidades: [{ id: 'u1', name: 'Beija Flor Centro' }], escolhida: null,
  dias: ['2026-09-29', '2026-09-30'],
  mapa: [{ unitId: 'u1', unitName: 'Beija Flor Centro', dias: [null, 'completa'], lancados: 1 }],
  lancamentos,
  resumo: { lancamentos: lancamentos.length, esperados: 2, semLancamento: 1, fotoCompleta: 1, fotoFaltando: 0, depois: 0 },
}) as never;

describe('Conferência', () => {
  it('mostra a miniatura da foto em /uploads/… e o selo "Com foto"', () => {
    const h = renderToString(<PainelConferencia d={conferencia([lanc()])} filtro="todos" linkFiltro={(f) => `?filtro=${f}`} fotoObrigatoria={false} />);
    expect(h).toContain('src="/uploads/u1/snack.jpg"');
    expect(h).not.toContain('/api/uploads');
    expect(h).toContain('Com foto');
    expect(h).toContain('30/09/2026');
    expect(h).toContain('Registrado por <b class="text-ink-700">Ana</b>');
  });
  it('lançamento sem foto diz isso, e o filtro "sem foto" esconde os completos', () => {
    const d = conferencia([lanc(), lanc({ id: 'y', date: '2026-09-29', fotos: [], foto: 'sem-foto' })]);
    const h = renderToString(<PainelConferencia d={d} filtro="sem-foto" linkFiltro={(f) => `?filtro=${f}`} fotoObrigatoria={false} />);
    expect(h).toContain('Nenhuma foto neste lançamento.');
    expect(h).not.toContain('src="/uploads/u1/snack.jpg"');
  });
});

describe('Performance', () => {
  it('dá o veredito pela média por dia lançado', () => {
    const r = (total: number, n: number) => ({ total, lancamentos: n, media: n ? total / n : 0 });
    const d = {
      frente: 'restaurante', year: 2026, month: 10, unidades: [], escolhida: null,
      resumo: { atual: r(60, 5), anterior: r(200, 20), anteriorAteHoje: r(50, 5), variacao: 20, direcao: 'subiu', diasDecorridos: 5 },
      serie: [{ date: '2026-10-01', total: 12, lancamentos: 1 }], serieAnterior: [{ date: '2026-09-01', total: 10, lancamentos: 1 }],
      porUnidade: [], partes: [], motivos: [], turnos: [], diaDaSemana: [], tendencia: [{ ym: '2026-10', total: 60, lancamentos: 5, media: 12 }], tendenciaPorUnidade: {},
    } as never;
    const h = renderToString(<PainelPerformance d={d} />);
    expect(h).toContain('Aumentou');
    expect(h).toContain('▲');
    expect(h).toMatch(/role="img"/);
  });
});
