import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/configuracoes/escalas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ScheduleTemplatesAdmin, type TemplateRow } from '@/components/admin/schedule-templates-admin';

const tipo = (over: Partial<TemplateRow> = {}): TemplateRow => ({
  id: 't1', name: '6x1 Tarde', workDays: 6, offDays: 1,
  startTime: '14:00', breakTime: '19:00', endTime: '22:17', active: true, ...over,
});

const render = (templates: TemplateRow[] = [tipo()]) =>
  renderToString(React.createElement(ScheduleTemplatesAdmin, { templates }));

/** Tira os `<!-- -->` que o SSR do React põe entre pedaços de texto. */
const semMarcadores = (html: string) => html.split('<!-- -->').join('');

describe('Tela de tipos de escala', () => {
  it('mostra o ciclo em palavras, não só o número', () => {
    /* "ciclo de 7 dias" evita o 6x2 digitado sem querer — número de ciclo
       sozinho é abstrato demais para conferir. */
    const html = render();
    expect(html).toContain('trabalha 6, folga 1');
    expect(html).toContain('ciclo de 7 dia(s)');
    expect(html).toContain('fecha na semana');
  });

  it('ciclo que não fecha na semana não promete dia fixo', () => {
    /* Asserção na LINHA da lista, não no HTML inteiro: o formulário de novo
       tipo nasce em 6/1 e mostra "fecha na semana" no próprio resumo — olhar a
       página toda daria um falso negativo. */
    const html = semMarcadores(
      render([tipo({ name: '12x36 Noturno', workDays: 1, offDays: 1, startTime: '19:00', breakTime: null, endTime: '07:00' })]),
    );
    expect(html).toContain('trabalha 1, folga 1 · ciclo de 2 dia(s) · 19:00–07:00');
  });

  it('os horários aparecem com o intervalo', () => {
    expect(render()).toContain('14:00–22:17 (intervalo 19:00)');
  });

  it('tipo sem horário não mostra faixa vazia', () => {
    const html = render([tipo({ startTime: null, breakTime: null, endTime: null })]);
    expect(html).toContain('trabalha 6, folga 1');
    expect(html).not.toContain('intervalo');
  });

  it('tipo inativo é marcado', () => {
    expect(render([tipo({ active: false })])).toContain('Inativo');
  });

  it('a tela explica que o 12x36 é 1 × 1', () => {
    /* Sem isso, ninguém adivinha que a escala de 12 horas se cadastra como 1x1. */
    expect(render()).toContain('12x36');
  });

  it('sem nenhum tipo, a tela continua montando', () => {
    expect(render([])).toContain('Nenhum tipo de escala cadastrado');
  });
});
