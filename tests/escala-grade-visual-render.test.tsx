import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/escala',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ScheduleClient } from '@/components/schedule/schedule-client';
import { CorpoDaPaleta } from '@/components/schedule/paleta-de-status';
import { STATUS } from '@/components/schedule/status-visual';
import { diaDeHoje } from '@/lib/schedule/grade-filtros';

/**
 * GRADE DE PRESENÇA — a evolução visual (v1.173.0), o que a tela PROMETE:
 * a folga salta aos olhos (peso 800, fundo cinza firme) e não se confunde com
 * férias; a coluna de hoje é marcada; cabeçalho e nomes grudam ao rolar; os
 * totais viram três pílulas com os MESMOS números; a paleta oferece os oito
 * status e "Limpar". Nenhuma regra: só aparência.
 */

type Props = React.ComponentProps<typeof ScheduleClient>;
type Status = 'WORK' | 'OFF' | 'FERIAS' | 'ATESTADO';

const linha = (nome: string, dias: Status[]) => ({
  collaboratorId: `c-${nome}`, name: nome, jobTitle: 'Aux. de Cozinha',
  typeLabel: '6x1 Tarde', scheduleType: 'SIX_ONE' as const, shiftLabel: '14:00–22:17',
  days: Array.from({ length: 31 }, (_, i) => ({ planned: 'WORK' as const, actual: dias[i] ?? ('WORK' as const) })),
});

function render(over: Partial<Props> = {}) {
  const props = {
    units: [{ id: 'u1', name: 'Jardim Teresópolis' }],
    selectedUnitId: 'u1', year: 2026, month: 8,
    grid: { year: 2026, month: 8, daysCount: 31, rows: [linha('ALESSANDRA', ['WORK', 'OFF', 'FERIAS', 'ATESTADO'])], withoutSchedule: [] },
    collaborators: [{ id: 'c-ALESSANDRA', name: 'ALESSANDRA' }],
    turnos: [], patterns: [],
    ...over,
  } as Props;
  return renderToString(React.createElement(ScheduleClient, props)).split('<!-- -->').join('');
}

describe('Folga em destaque', () => {
  it('F tem peso 800, fundo cinza firme, texto escuro e borda; FE continua verde', () => {
    expect(STATUS.OFF.cls).toContain('font-extrabold');
    expect(STATUS.OFF.cls).toContain('bg-sunken');
    expect(STATUS.OFF.cls).toContain('text-ink-900');
    expect(STATUS.OFF.cls).toContain('border-line-strong');
    expect(STATUS.FERIAS.cls).toContain('success');
    expect(STATUS.FERIAS.cls).not.toContain('font-extrabold');
    /* o T segue bordô */
    expect(STATUS.WORK.cls).toContain('bg-brand');
  });

  it('a célula de folga da grade e a pílula F dos totais saem em negrito 800', () => {
    const html = render();
    const celulaF = html.match(/<button[^>]*font-extrabold[^>]*>F<\/button>/);
    expect(celulaF).not.toBeNull();
    expect(html).toContain('>F 1</span>');
    expect(html).toContain('>T 28</span>');
    expect(html).toContain('>Aus 2</span>'); // férias + atestado
  });
});

describe('Grade', () => {
  it('cabeçalho dos dias fixo no topo, nomes fixos à esquerda, quadro que rola por dentro, linha com hover', () => {
    const html = render();
    expect(html).toContain('data-testid="grade-escala"');
    expect(html).toContain('max-height:calc(100vh - 220px)');
    expect(html).toContain('class="col-dia sticky top-0 z-20');
    expect(html).toContain('class="col-nome sticky left-0 z-10');
    expect(html).toContain('group-hover:bg-sunken');
  });

  it('a coluna de HOJE é marcada quando a grade é do mês atual — e não é quando é de outro mês', () => {
    const agora = new Date();
    const hoje = diaDeHoje(agora.getFullYear(), agora.getMonth() + 1, agora);
    expect(hoje).not.toBeNull();
    const dias = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const html = render({ year: agora.getFullYear(), month: agora.getMonth() + 1, grid: { year: agora.getFullYear(), month: agora.getMonth() + 1, daysCount: dias, rows: [linha('A', [])], withoutSchedule: [] } });
    expect(html).toContain(`data-hoje="${hoje}"`);
    expect(render({ year: 2020, month: 1, grid: { year: 2020, month: 1, daysCount: 31, rows: [linha('A', [])], withoutSchedule: [] } })).not.toContain('data-hoje=');
  });

  it('diaDeHoje usa o dia de Brasília: às 23h30 em Brasília do dia 31 (02h30 UTC do dia 1º) ainda é 31 do mês da grade', () => {
    expect(diaDeHoje(2026, 8, new Date('2026-09-01T02:30:00Z'))).toBe(31);
    expect(diaDeHoje(2026, 9, new Date('2026-09-01T02:30:00Z'))).toBeNull();
    expect(diaDeHoje(2026, 9, new Date('2026-09-01T03:30:00Z'))).toBe(1);
  });

  it('legenda e totais seguem com os mesmos rótulos; a impressão não perde a identificação', () => {
    const html = render();
    for (const r of ['Trabalho', 'Atraso', 'Folga', 'Falta injustificada', 'Falta justificada', 'Atestado', 'Férias', 'Afastado']) expect(html).toContain(r);
    expect(html).toContain('T · F · Aus');
    expect(html).toContain('Escala — Jardim Teresópolis · Agosto/2026 · Realizado');
  });
});

describe('PDF — grade uniforme (v1.173.1)', () => {
  const css = readFileSync('src/styles/globals.css', 'utf8');
  const bloco = css.slice(css.indexOf('.escala-grade { max-height: none'));

  it('toda célula tem a MESMA borda fina (da célula, não do status), o miolo perde borda/raio e preenche; cabeçalho bordô; faixa do grupo; nome quebra em vez de cortar', () => {
    expect(bloco).toContain('.escala-grade th, .escala-grade td { border: 0.5pt solid var(--sgo-line-strong) !important;');
    expect(bloco).toContain('.escala-grade td.col-dia > * { border: 0 !important; border-radius: 0 !important;');
    expect(bloco).toContain('.escala-grade thead th { background: var(--sgo-brand) !important; color: var(--sgo-on-brand) !important;');
    expect(bloco).toContain('.escala-grade tr.escala-grupo td { background: var(--sgo-sunken) !important;');
    expect(bloco).toContain('print-color-adjust: exact');
    expect(bloco).toContain('.escala-grade .escala-nome { white-space: normal !important;');
    const html = render();
    expect(html).toContain('class="escala-grupo bg-sunken"');
    expect(html).toContain('class="escala-nome ');
    expect(html).not.toContain('print:truncate');
    /* o @page é do componente (só vale com a tela montada); A4, não "a folha que a impressora tiver" */
    expect(html).toContain('<style>@page { size: A4 landscape; margin: 5mm; }</style>');
  });

  it('as 31 colunas e os totais cabem na A4 paisagem: 176 + 31×26 + 76 = 1058px < 1085px úteis; totais saem como três números no papel', () => {
    expect(bloco).toContain('.escala-grade .col-nome { width: 176px;');
    expect(bloco).toContain('.escala-grade .col-dia { width: 26px; }');
    expect(bloco).toContain('.escala-grade .col-tot { width: 76px;');
    expect(176 + 31 * 26 + 76).toBeLessThan(1085);
    const html = render();
    expect(html).toContain('data-testid="totais-impressao"');
    expect(html).toContain('>28 · 1 · 2</span>');
    expect(html).toContain('print:hidden" data-testid="totais-linha"');
  });
});

describe('Paleta de status', () => {
  it('oferece os oito códigos, com o atual marcado, e "Limpar o dia"', () => {
    const html = renderToString(React.createElement(CorpoDaPaleta, { nome: 'ALESSANDRA', dia: 12, valor: 'OFF', onEscolher: () => {}, onClose: () => {} }));
    for (const c of ['>T<', '>AT<', '>F<', '>FI<', '>FJ<', '>A<', '>FE<', '>AF<']) expect(html).toContain(c);
    expect(html).toContain('Limpar o dia');
    expect(html).toContain('aria-label="Status de ALESSANDRA no dia 12"');
    expect(html).toMatch(/aria-label="Folga" aria-pressed="true"/);
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    /* botões de 44px: tamanho de toque */
    expect(html).toContain('h-11');
  });
});
