import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { HigieneCabecalho, HygienePublicForm, iconeDoBanheiro, LIMITE_OBSERVACAO } from '@/components/hygiene/hygiene-public-form';
import { HYGIENE_ISSUES } from '@/lib/hygiene';

/** Formulário público do QR (visual v1.165.0): o que o cliente vê antes de tocar. */
/* O SSR separa nós de texto adjacentes com <!-- -->; o cliente lê "1. Qual banheiro?" inteiro. */
const limpo = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const locs = [{ id: 'f', name: 'Banheiro Feminino' }, { id: 'm', name: 'Banheiro Masculino' }];

describe('QR do banheiro — formulário', () => {
  it('três passos numerados, um tile por motivo do catálogo e o botão de enviar desligado até marcar', () => {
    const html = limpo(renderToString(<HygienePublicForm unitId="u" locations={locs} preselect={null} />));
    expect(html).toContain('1. Qual banheiro?');
    expect(html).toContain('2. O que está acontecendo?');
    expect(html).toContain('3. Observações');
    for (const issue of HYGIENE_ISSUES) expect(html).toContain(`data-testid="motivo-${issue}"`);
    expect(html).toContain('Necessita de manutenção');
    expect(html).toContain('Outro problema');
    expect(html).toContain(`0/${LIMITE_OBSERVACAO}`);
    expect(html).toContain('Um toque já avisa a equipe.');
    expect(html).toMatch(/data-testid="enviar-solicitacao"[^>]*disabled|disabled[^>]*data-testid="enviar-solicitacao"/);
  });

  it('QR de um banheiro (?loc=) já vem com ele marcado; o cliente ainda pode trocar', () => {
    const html = limpo(renderToString(<HygienePublicForm unitId="u" locations={locs} preselect="f" />));
    expect(html).toContain('1. Qual banheiro?');
    expect(html).toMatch(/data-testid="banheiro-f"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="banheiro-f"/);
    expect(html).toMatch(/data-testid="banheiro-m"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*data-testid="banheiro-m"/);
  });

  it('unidade com um banheiro só pula a escolha e renumera os passos', () => {
    const html = limpo(renderToString(<HygienePublicForm unitId="u" locations={[locs[0]]} preselect={null} />));
    expect(html).not.toContain('Qual banheiro?');
    expect(html).toContain('1. O que está acontecendo?');
    expect(html).toContain('2. Observações');
  });

  it('cabeçalho com o beija-flor do sistema, a unidade e o banheiro', () => {
    const html = limpo(renderToString(<HigieneCabecalho unidade="Beija Flor Centro" banheiro="Banheiro Feminino" />));
    expect(html).toContain('/sgo-bird-only.png');
    expect(html).toContain('Higienização do Local');
    expect(html).toContain('Beija Flor Centro · Banheiro Feminino');
    expect(html).toContain('Sua solicitação vai direto para a nossa equipe.');
  });

  it('pictograma do banheiro escolhido pelo nome cadastrado', () => {
    expect(iconeDoBanheiro('Banheiro Feminino')).toBe(iconeDoBanheiro('WC FEMININO'));
    expect(iconeDoBanheiro('Banheiro Feminino')).not.toBe(iconeDoBanheiro('Banheiro Masculino'));
    expect(renderToString(React.createElement(iconeDoBanheiro('Banheiro PCD'), { className: 'x' }))).toContain('<svg');
  });
});
