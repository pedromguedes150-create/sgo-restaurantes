import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/escala/folgas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { FolgasLoteClient } from '@/components/schedule/folgas-lote-client';
import type { LinhaDeFolga } from '@/lib/schedule/folgas-lote';

const tipos = [
  { id: 't6', name: '6x1 Tarde', workDays: 6, offDays: 1 },
  { id: 't12', name: '12x36 Noturno', workDays: 1, offDays: 1 },
];

const linha = (over: Partial<LinhaDeFolga> = {}): LinhaDeFolga => ({
  collaboratorId: 'c1', name: 'ALESSANDRA CRUZ DA SILVA', jobTitle: 'Aux. de Cozinha',
  templateId: 't6', templateName: '6x1 Tarde', semanal: true,
  weeklyOffDay: 1, offMode: 'FIXED_WEEKLY', semEscala: false, ...over,
});

const render = (linhas: LinhaDeFolga[] = [linha()]) =>
  renderToString(React.createElement(FolgasLoteClient, { unitId: 'u1', unitName: 'Jardim Teresópolis', linhas, tipos }))
    .split('<!-- -->').join('');

describe('Folgas da unidade — uma linha por pessoa', () => {
  it('o botão traz as definições de cada colaborador', () => {
    expect(render()).toContain('Buscar definições de cada colaborador');
  });

  it('mostra o que a pessoa JÁ TEM hoje', () => {
    /* É o "preenchimento automático" que faltava: abrir a tela já com a
       configuração atual, para o gerente corrigir só o que estiver errado. */
    const html = render();
    expect(html).toContain('ALESSANDRA CRUZ DA SILVA');
    expect(html).toContain('hoje: 6x1 Tarde');
    expect(html).toContain('folga segunda');
  });

  it('conta quantos folgam em cada dia', () => {
    /* Sem esse número dá para deixar a segunda inteira sem ninguém e só
       descobrir no dia. */
    const html = render([linha(), linha({ collaboratorId: 'c2', name: 'BRUNO', weeklyOffDay: 1 })]);
    expect(html).toContain('Segunda: 2');
    expect(html).toContain('Domingo: 0');
  });

  it('quem está sem escala aparece marcado, não escondido', () => {
    const html = render([linha({ semEscala: true, templateId: null, templateName: null, weeklyOffDay: null, semanal: false })]);
    expect(html).toContain('sem escala cadastrada');
  });

  it('ciclo que não fecha na semana explica por que não dá para escolher', () => {
    const html = render([linha({ templateId: 't12', templateName: '12x36 Noturno', semanal: false, weeklyOffDay: null })]);
    expect(html).toContain('Ciclo não fecha na semana');
  });

  it('unidade sem colaboradores não estoura', () => {
    expect(render([])).toContain('0 colaborador(es)');
  });
});
