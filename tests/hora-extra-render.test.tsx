import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/hora-extra',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { HoraExtraClient, type HoraExtraClientProps } from '@/components/hora-extra/hora-extra-client';
import { evolucaoMensal, porMotivo, porStatus, resumirHE, type HoraExtra } from '@/lib/hora-extra/calculo';

/**
 * A TELA DE HORA EXTRA. O que não pode acontecer: oferecer aprovar/reprovar
 * (decisão do Pedro — isso fica em Pagamentos), esconder quem está sem
 * vínculo com o RH, ou mostrar KPI que não bate com a lista.
 */

const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

const he = (over: Partial<HoraExtra> = {}): HoraExtra => ({
  id: 'h1', unitId: 'u1', unidade: 'Beija Flor Centro', collaboratorId: 'c1', colaborador: 'Vera Lúcia dos Anjos', matricula: '1234', cpf: '09494305604',
  dia: '2026-09-15', inicio: '18:00', fim: '21:00', horas: 3, valorHora: 15, vt: 0, valor: 45, motivoId: 'm1', motivo: 'Escala incompleta', detalhe: null,
  status: 'PAID', solicitante: 'Ger', aprovador: 'Sup', motivoReprovacao: null, criadoEm: '2026-09-16T10:00:00.000Z', ...over,
});

const hes = [
  he(),
  he({ id: 'h2', dia: '2026-09-20', status: 'PENDING', valor: 30, horas: 2, motivoId: null, motivo: 'Outro', detalhe: 'cobriu o Carlos', collaboratorId: null, matricula: null, cpf: null, colaborador: 'Alessandra' }),
];

const base = (over: Partial<HoraExtraClientProps> = {}): HoraExtraClientProps => ({
  filtro: { aba: 'dashboard', periodo: 'mes', status: 'TODOS', motivo: '', q: '' },
  periodo: { de: '2026-09-01', ate: '2026-09-30', rotulo: 'setembro de 2026' },
  hes, resumo: resumirHE(hes), motivos: porMotivo(hes), status: porStatus(hes), evolucao: evolucaoMensal(hes, ['2026-09']),
  unidades: [{ id: 'u1', name: 'Beija Flor Centro' }, { id: 'u2', name: 'Beija Flor Orla' }],
  motivosCatalogo: [{ id: 'm1', name: 'Escala incompleta' }],
  semVinculo: [{ id: 'h2', unitId: 'u1', unidade: 'Beija Flor Centro', nome: 'Alessandra', dia: '2026-09-20', valor: 30, sugestoes: [{ id: 'c9', name: 'Alessandra Cruz' }], opcoes: [{ id: 'c9', name: 'Alessandra Cruz' }] }],
  form: { units: [], collaboratorsByUnit: {}, overtimeRatesByUnit: {} },
  podeLancar: true, podeFechar: true, podeVincular: true, isAdmin: true,
  ...over,
});

const tela = (over: Partial<HoraExtraClientProps> = {}) => semSeparadores(renderToString(<HoraExtraClient {...base(over)} />));

describe('Dashboard', () => {
  it('KPIs batem com a lista; comparativo por motivo inclui "Outro"; evolução do mês', () => {
    const h = tela();
    expect(h).toContain('Total pago');
    expect(h).toMatch(/R\$\s45,00/);
    expect(h).toContain('Escala incompleta');
    expect(h).toContain('Outro');
    expect(h).toContain('set/26');
    expect(h).toContain('Status das solicitações');
    expect(h).toContain('Pendentes');
  });

  it('cabeçalho: Exportar xlsx com o filtro, Configurar só para Admin, Nova solicitação só para quem lança', () => {
    const h = tela();
    expect(h).toContain('/api/hora-extra/export?');
    expect(h).toContain('Exportar xlsx');
    expect(h).toContain('/configuracoes/pagamentos#motivos-hora-extra');
    expect(h).toContain('Nova solicitação');
    const g = tela({ isAdmin: false, podeLancar: false });
    expect(g).not.toContain('Configurar');
    expect(g).not.toContain('Nova solicitação');
  });

  it('aponta as HE sem vínculo com o RH para quem pode vincular — e esconde de quem não pode', () => {
    expect(tela()).toContain('1 hora(s) extra(s) antiga(s) sem vínculo com o RH');
    expect(tela({ podeVincular: false })).not.toContain('sem vínculo com o RH');
  });
});

describe('Solicitações: consulta, não aprovação', () => {
  it('lista com matrícula/CPF, motivo e status — e NENHUM botão de aprovar ou reprovar', () => {
    const h = tela({ filtro: { aba: 'solicitacoes', periodo: 'mes', status: 'TODOS', motivo: '', q: '' } });
    expect(h).toContain('Matr. 1234');
    expect(h).toContain('094.943.056-04');
    expect(h).toContain('sem matrícula');
    expect(h).toContain('Escala incompleta');
    expect(h).toContain('cobriu o Carlos');
    expect(h).toContain('Paga');
    expect(h).toContain('Pendente');
    expect(h).not.toMatch(/>\s*Aprovar\s*</);
    expect(h).not.toMatch(/>\s*Reprovar\s*</);
    expect(h).not.toContain('Selecionar todas');
    expect(h).toContain('continuam em');
  });
});
