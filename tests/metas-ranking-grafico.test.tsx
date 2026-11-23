import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RankingDeMetas } from '@/components/metas/graficos-metas';
import { resumirRanking } from '@/lib/metas/graficos';

/** v1.223.0 — o Ranking de metas em gráfico: rosca da rede + uma barra por unidade com a linha da meta. */
const ranking = [
  { unitId: 'a', name: 'Nova União', scorePct: 85 },
  { unitId: 'b', name: 'Jardim Teresópolis', scorePct: 73 },
  { unitId: 'c', name: 'Moreira', scorePct: 47 },
  { unitId: 'd', name: 'Lanchonete', scorePct: 0 },
].map((r) => ({ ...r, href: `/modulos/metas?unit=${r.unitId}` }));

const render = (selecionada?: string) => renderToString(React.createElement(RankingDeMetas, { ranking, resumo: resumirRanking(ranking), selecionada })).split('<!-- -->').join('');

describe('Ranking de metas em gráfico', () => {
  it('mostra a rosca da rede com a média, o pódio e uma barra por unidade, na ordem, cada uma abrindo a unidade', () => {
    const h = render('b');
    expect(h).toContain('data-testid="rosca-unidades"');
    expect(h).toContain('média da rede');
    expect(h).toContain('de 4 unidade(s) na meta');
    expect(h).toContain('data-testid="podio"');
    expect(h.match(/data-testid="barra-da-unidade"/g)).toHaveLength(4);
    expect(h.indexOf('Nova União')).toBeLessThan(h.indexOf('Moreira'));
    expect(h).toContain('href="/modulos/metas?unit=c"');
    expect(h).toMatch(/aria-current="true"[^>]*>|aria-current="true"/);
  });

  it('diz quanto falta para a meta e marca quem já chegou; nota zero ainda desenha a linha', () => {
    const h = render();
    expect(h).toContain('na meta');
    expect(h).toContain('faltam 7 p.p.');
    expect(h).toContain('faltam 33 p.p.');
    expect(h).toContain('faltam 80 p.p.');
    expect(h).toContain('meta 80%');
    expect(h).not.toContain('aria-current');
  });
});
