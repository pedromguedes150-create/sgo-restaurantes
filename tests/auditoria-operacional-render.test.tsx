import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/auditoria-operacional',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { AuditoriaOperacionalClient } from '@/components/auditoria-operacional/auditoria-operacional-client';
import type { AuditoriaOperacional, OcorrenciaDaAuditoria } from '@/lib/auditoria-operacional/auditoria';

/** Tela da auditoria operacional (v1.184.0): o que ela diz antes de qualquer clique. */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const conf = { esperados: 0, conformes: 0, justificados: 0, falhas: 0, emConferencia: 0, noPrazo: 0, invalidos: 0, base: 0, pct: null as number | null };

const ocorrencia: OcorrenciaDaAuditoria = {
  id: 'o1', modulo: 'NOTES', unitId: 'u1', unitName: 'Centro', reference: 'Distribuidora Sul nº 123', eventDate: '2026-10-04',
  noticeAt: '2026-10-04T13:00:00Z', prazoAte: '2026-10-05T13:00:00Z', source: 'SUPPLIER', sourceDetail: 'o entregador ligou',
  informedByName: 'Sup', expectedUserName: 'Ana', note: null,
  lancamento: null, candidatos: [{ id: 'n1', data: '2026-10-05', descricao: 'Distribuidora Sul · nº 123 · R$ 150,00', lancadoEm: '2026-10-08T10:00:00Z', lancadoPor: 'Ana' }],
  situacao: 'EM_CONFERENCIA', justification: null, justifiedByName: null, justifiedAt: null,
  reviewStatus: 'AGUARDANDO', reviewNote: null, reviewedByName: null, reviewedAt: null,
  responsibleUserId: null, responsibleName: null, responsibilityValidatedAt: null,
};
const dados: AuditoriaOperacional = {
  yearMonth: '2026-10', modulo: 'NOTES', prazoHoras: 24, pctPorFalha: 10,
  modulos: [
    { modulo: 'NOTES', rotulo: 'Notas recebidas', prazoHoras: 24, pctPorFalha: 10, ...conf, esperados: 1, emConferencia: 1, pontos: null, penalizacao: null },
    { modulo: 'GAS', rotulo: 'Recebimento de gás', prazoHoras: 24, pctPorFalha: 10, ...conf, esperados: 2, conformes: 1, falhas: 1, base: 2, pct: 50, pontos: 90, penalizacao: 10 },
    { modulo: 'OIL', rotulo: 'Coleta de óleo', prazoHoras: 48, pctPorFalha: 25, ...conf, pontos: null, penalizacao: null },
    { modulo: 'PAYMENTS', rotulo: 'Pagamentos', prazoHoras: 24, pctPorFalha: 10, ...conf, pontos: null, penalizacao: null },
  ],
  ocorrencias: [ocorrencia],
  rede: { ...conf, esperados: 1, emConferencia: 1, pontos: null, penalizacao: null },
  porUnidade: [{ unitId: 'u1', unitName: 'Centro', ...conf, esperados: 1, emConferencia: 1, pontos: null, penalizacao: null }],
  porGerente: [],
  gerentesPorUnidade: { u1: [{ id: 'g1', name: 'Ana' }] },
};

describe('Auditoria operacional', () => {
  it('KPIs, regra, lista com vincular/justificar/decidir, os quatro módulos e a linha dos atestados com link para a Central', () => {
    const html = semSeparadores(renderToString(
      <AuditoriaOperacionalClient auditoria={dados} ym="2026-10" unitFiltro="" units={[{ id: 'u1', name: 'Centro' }, { id: 'u2', name: 'Orla' }]} podeInformar podeJustificar
        atestados={{ esperados: 3, conformes: 2, justificados: 0, falhas: 1, emConferencia: 0, pct: 66.7, pontos: 50 }} linkAtestados="/modulos/atestados?aba=auditoria&mes=2026-10" />,
    ));
    expect(html).toContain('data-testid="auditoria-operacional"');
    expect(html).toContain('Informar ocorrência');
    expect(html).toContain('24 horas úteis');
    expect(html).toContain('<b>10%</b>');
    expect(html).toContain('Distribuidora Sul nº 123');
    expect(html).toContain('1 lançamento(s) na janela');
    expect(html).toContain('Em conferência');
    expect(html).toContain('data-testid="btn-vincular"');
    expect(html).toContain('Justificar');
    expect(html).toContain('data-testid="btn-revisar"');
    expect(html).toContain('Fornecedor / coletora / prestador — o entregador ligou');
    expect(html).toContain('Previsto: Ana');
    expect(html).toContain('data-testid="tabela-modulos"');
    expect(html).toContain('Recebimento de gás');
    expect(html).toContain('90/100');
    expect(html).toContain('48 h');
    expect(html).toContain('data-testid="linha-atestados"');
    expect(html).toContain('href="/modulos/atestados?aba=auditoria&amp;mes=2026-10"');
    expect(html).toContain('66,7%');
    expect(html).toContain('/api/auditoria-operacional/export?mes=2026-10&amp;modulo=notes');
  });
  it('sem permissão de informar/justificar: nem botão de informar, nem ações na linha; sem atestados: sem a linha', () => {
    const html = semSeparadores(renderToString(
      <AuditoriaOperacionalClient auditoria={dados} ym="2026-10" unitFiltro="u1" units={[{ id: 'u1', name: 'Centro' }]} podeInformar={false} podeJustificar={false} atestados={null} linkAtestados={null} />,
    ));
    expect(html).not.toContain('Informar ocorrência');
    expect(html).not.toContain('data-testid="btn-vincular"');
    expect(html).not.toContain('data-testid="btn-revisar"');
    expect(html).not.toContain('>Justificar<');
    expect(html).not.toContain('data-testid="linha-atestados"');
    expect(html).not.toContain('aria-label="Unidade"'); // uma unidade só: sem filtro
  });
});
