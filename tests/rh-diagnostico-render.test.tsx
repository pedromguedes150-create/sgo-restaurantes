import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A TELA do diagnóstico do RH.
 *
 * Compilar não é renderizar: uma página de servidor pode passar no `tsc` e
 * explodir ao montar. Como a tela exige sessão de Admin, abrir no navegador
 * pedia senha — então ela é montada aqui, com a sessão e os dados fingidos, e o
 * que se mede é o que a pessoa LÊ: o motivo de cada ausência.
 */

let sessao: { id: string; name: string; role: string; unitIds: string[]; seesAllUnits: boolean; needsTerms: boolean } =
  { id: 'u1', name: 'Alan', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };

let diagnostico: unknown = null;
const unidades = [
  { id: 'u-igarape', name: 'Igarapé', rhUnitName: 'CHURRASCARIA IGARAPE LTDA' },
  { id: 'u-outra', name: 'Outra', rhUnitName: null },
];

vi.mock('@/lib/auth/session', () => ({ getSessionUser: async () => sessao }));
vi.mock('@/lib/rh/diagnostico', async () => {
  const real = await vi.importActual<typeof import('@/lib/rh/diagnostico')>('@/lib/rh/diagnostico');
  return {
    ...real,
    unidadesDoDiagnostico: async () => unidades,
    diagnosticarUnidade: async () => diagnostico,
  };
});

import { renderToString } from 'react-dom/server';
import React from 'react';
import Page from '@/app/(app)/configuracoes/integracoes/diagnostico/page';
import type { DiagnosticoDaUnidade } from '@/lib/rh/diagnostico';

function base(over: Partial<DiagnosticoDaUnidade> = {}): DiagnosticoDaUnidade {
  return {
    unitId: 'u-igarape', unitName: 'Igarapé', rhUnitName: 'CHURRASCARIA IGARAPE LTDA',
    nomeConfere: true, parecidas: [], erro: null,
    totalNoRh: 0, pessoas: [], soNoSgo: [],
    resumo: { ATIVO_NO_SGO: 0, ATIVO_STATUS_DESCONHECIDO: 0, INATIVO_POR_STATUS: 0, PULADO_SEM_MATRICULA: 0, NAO_ENCONTRADO_NO_SGO: 0 },
    ativosNoSgo: 0,
    ...over,
  };
}

async function render(searchParams: { unit?: string } = {}) {
  const el = await Page({ searchParams });
  return renderToString(el).split('<!-- -->').join('');
}

beforeEach(() => {
  sessao = { id: 'u1', name: 'Alan', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
  diagnostico = base();
});

describe('A tela monta e diz o essencial', () => {
  it('lista as unidades para escolher', async () => {
    const html = await render();
    expect(html).toContain('Igarapé');
    expect(html).toContain('Outra');
  });

  it('mostra o "Nome no RH" configurado e os dois totais', async () => {
    diagnostico = base({ totalNoRh: 12, ativosNoSgo: 9 });
    const html = await render();
    expect(html).toContain('CHURRASCARIA IGARAPE LTDA');
    expect(html).toContain('12');
    expect(html).toContain('9');
  });
});

describe('Os motivos aparecem escritos, não só contados', () => {
  it('status não-ativo: diz que a pessoa SOME das telas', async () => {
    diagnostico = base({
      totalNoRh: 2, ativosNoSgo: 1,
      resumo: { ATIVO_NO_SGO: 1, ATIVO_STATUS_DESCONHECIDO: 0, INATIVO_POR_STATUS: 1, PULADO_SEM_MATRICULA: 0, NAO_ENCONTRADO_NO_SGO: 0 },
      pessoas: [
        { matricula: '2', nome: 'DE FERIAS', cargo: 'Atendente', statusNoRh: 'Demitido', decisao: 'INATIVO_POR_STATUS', nomeNoSgo: 'DE FERIAS' },
        { matricula: '1', nome: 'ATIVA', cargo: 'Caixa', statusNoRh: 'Ativo', decisao: 'ATIVO_NO_SGO', nomeNoSgo: 'ATIVA' },
      ],
    });
    const html = await render();
    expect(html).toContain('DE FERIAS');
    expect(html).toContain('Demitido');
    expect(html).toContain('SOME de Pessoas');
  });

  it('sem matrícula: marca a pessoa e explica que ela nunca chegou', async () => {
    diagnostico = base({
      totalNoRh: 1,
      resumo: { ATIVO_NO_SGO: 0, ATIVO_STATUS_DESCONHECIDO: 0, INATIVO_POR_STATUS: 0, PULADO_SEM_MATRICULA: 1, NAO_ENCONTRADO_NO_SGO: 0 },
      pessoas: [{ matricula: null, nome: 'SEM MATRICULA', cargo: null, statusNoRh: 'Ativo', decisao: 'PULADO_SEM_MATRICULA', nomeNoSgo: null }],
    });
    const html = await render();
    expect(html).toContain('sem matrícula');
    expect(html).toContain('nunca chegou ao SGO');
  });
});

describe('O nome que não bate é o aviso mais alto', () => {
  it('acusa e mostra os parecidos para comparar', async () => {
    diagnostico = base({ nomeConfere: false, parecidas: ['CHURRASCARIA IGARAPÉ LTDA.'] });
    const html = await render();
    expect(html).toContain('NÃO existe na lista de unidades do RH');
    expect(html).toContain('CHURRASCARIA IGARAPÉ LTDA.');
  });
});

describe('Quem está no SGO e o RH não devolve', () => {
  it('é listado, com aviso de que seria desligado', async () => {
    diagnostico = base({
      soNoSgo: [{ id: 'c1', name: 'FANTASMA', externalId: '77', active: true }],
    });
    const html = await render();
    expect(html).toContain('FANTASMA');
    expect(html).toContain('o RH não devolveu');
  });
});

describe('Porta fechada', () => {
  it('quem não é Admin nem CEO não vê nada', async () => {
    sessao = { id: 'u2', name: 'Gerente', role: 'MANAGER', unitIds: ['u-igarape'], seesAllUnits: false, needsTerms: false };
    const html = await render();
    expect(html).toContain('Restrito ao Administrador');
    expect(html).not.toContain('CHURRASCARIA');
  });
});

describe('Falha do RH não derruba a tela', () => {
  it('o erro é mostrado como texto, e o que o SGO tem continua visível', async () => {
    diagnostico = base({
      erro: 'Falha ao consultar o RH (504): RH não respondeu em 20s',
      ativosNoSgo: 7,
      soNoSgo: [{ id: 'c1', name: 'ALGUEM', externalId: '1', active: true }],
    });
    const html = await render();
    expect(html).toContain('não respondeu em 20s');
    expect(html).toContain('7');
    expect(html).toContain('ALGUEM');
  });
});
