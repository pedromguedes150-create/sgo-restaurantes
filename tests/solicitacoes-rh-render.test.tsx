import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pessoas/demandas-rh',
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { SolicitacoesRhClient, type SolicitacoesRhProps } from '@/components/people/solicitacoes-rh-client';
import { situacaoParaTela } from '@/components/people/solicitacao-situacao';
import { montarPainel, type LinhaDaSolicitacao } from '@/lib/rh/solicitacoes-regras';

/** SOLICITAÇÕES AO RH (v1.217.0) — a tela, nas três abas. */
const sem = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
const linha = (p: Partial<LinhaDaSolicitacao> = {}): LinhaDaSolicitacao => ({
  id: 's1', tipo: 'FERIAS', titulo: 'Férias — Ana Lima', prioridade: 'NORMAL', unitId: 'u1', unitName: 'Moreira', collaboratorName: 'Ana Lima',
  createdById: 'g1', createdByName: 'Gabriel', createdAt: '2026-11-10T12:00:00.000Z', rhNumero: 'DM-15', rhPrazoAlvo: '2026-11-12', rhSituacao: 'em_andamento',
  rhSituacaoAt: '2026-11-11T12:00:00.000Z', situacaoRotulo: 'Em andamento', envio: 'ENVIADO', anexos: 1, ...p,
});
const linhas = [linha(), linha({ id: 's2', titulo: 'Dúvida de ponto', tipo: 'DUVIDA', collaboratorName: null, rhNumero: null, rhPrazoAlvo: null, rhSituacao: null, rhSituacaoAt: null, situacaoRotulo: 'Aguardando envio ao RH', envio: 'AGUARDANDO', anexos: 0, prioridade: 'URGENTE' })];
const base: SolicitacoesRhProps = {
  aba: 'minhas', abas: ['minhas', 'nova', 'painel'], linhas, limiteAtingido: false, painel: null, hoje: '2026-11-19', podeCriar: true,
  units: [{ id: 'u1', name: 'Moreira' }], unidadeInicial: 'u1', collaboratorsByUnit: { u1: [{ id: 'c1', name: 'Ana Lima' }] }, visaoRede: false,
};
const render = (p: Partial<SolicitacoesRhProps> = {}) => sem(renderToString(<SolicitacoesRhClient {...base} {...p} />));

describe('Solicitações ao RH — Minhas Solicitações', () => {
  it('nome novo, subtítulo, botão de nova solicitação e as três abas', () => {
    const h = render();
    expect(h).toContain('Solicitações ao RH');
    expect(h).not.toContain('Demandas ao RH');
    expect(h).toContain('Abra e acompanhe suas solicitações.');
    expect(h).toContain('data-testid="nova-solicitacao"');
    for (const a of ['minhas', 'nova', 'painel']) expect(h).toContain(`data-testid="aba-${a}"`);
  });

  it('três indicadores e a lista com protocolo, tipo, colaborador, situação e prazo', () => {
    const h = render();
    for (const k of ['kpi-andamento', 'kpi-aguardando', 'kpi-concluidas']) expect(h).toContain(`data-testid="${k}"`);
    expect(h).toContain('Aguardando minha resposta');
    expect(h).toContain('DM-15');
    expect(h).toContain('Férias — Ana Lima');
    expect(h).toContain('Ana Lima');
    expect(h).toContain('Em andamento');
    expect(h).toContain('12/11/2026');
    expect(h).toContain('vencido');
    expect(h).toContain('Enviando ao RH');
    expect(h).toContain('Urgente');
    expect(h).toContain('data-testid="filtros"');
  });

  it('quando o RH espera resposta, a linha diz isso', () => {
    const h = render({ linhas: [linha({ rhSituacao: 'aguardando_solicitante', situacaoRotulo: 'Aguardando resposta da unidade' })] });
    expect(h).toContain('data-testid="pendencia"');
    expect(h).toContain('O RH aguarda a sua resposta');
  });

  it('perfil sem a aba de gestão não a vê; sem poder criar, não há botão', () => {
    const h = render({ abas: ['minhas'], podeCriar: false });
    expect(h).not.toContain('data-testid="aba-painel"');
    expect(h).not.toContain('data-testid="nova-solicitacao"');
  });
});

describe('Solicitações ao RH — Nova Solicitação', () => {
  it('unidade única vem fixa, o tipo é a primeira escolha e Atestado aponta para a Central', () => {
    const h = render({ aba: 'nova' });
    expect(h).toContain('data-testid="nova-solicitacao-form"');
    expect(h).toContain('data-testid="unidade-fixa"');
    expect(h).toContain('Tipo de solicitação');
    expect(h).toContain('data-testid="aviso-atestado"');
    expect(h).toContain('/modulos/atestados');
    /* Antes de escolher o tipo não há campo nenhum a preencher. */
    expect(h).not.toContain('data-testid="campos-do-tipo"');
    expect(h).not.toContain('data-testid="resumo"');
  });

  it('o envio é um só, em multipart, para a rota de sempre', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/components/people/solicitacoes-rh-client.tsx'), 'utf8');
    expect(fonte.match(/fetch\(/g)).toHaveLength(1);
    expect(fonte).toContain("fetch('/api/rh/demandas', { method: 'POST', body: form })");
    expect(fonte).toContain('oQueFalta(');
  });
});

describe('Solicitações ao RH — Painel de Gestão', () => {
  it('indicadores, pendências e as quebras por unidade, tipo e solicitante', () => {
    const todas = [...linhas, linha({ id: 's3', unitId: 'u2', unitName: 'Centro', rhSituacao: 'concluido', situacaoRotulo: 'Concluído', rhSituacaoAt: '2026-11-12T12:00:00.000Z' })];
    const h = render({ aba: 'painel', linhas: todas, painel: montarPainel(todas, new Date('2026-11-19T15:00:00.000Z'), '2026-11-19'), visaoRede: true });
    expect(h).toContain('data-testid="painel-de-gestao"');
    expect(h).toContain('data-testid="painel-pendencias"');
    expect(h).toContain('Prazo do RH vencido');
    expect(h).toContain('Por unidade');
    expect(h).toContain('Por tipo');
    expect(h).toContain('Quem mais solicita');
    expect(h).toContain('Tempo médio até concluir');
  });
});

describe('Solicitações ao RH — a situação que o gerente lê', () => {
  it('enquanto não chegou ao RH mostra o envio; depois, a situação do RH', () => {
    expect(situacaoParaTela({ envio: 'AGUARDANDO', rhSituacao: null, situacaoRotulo: 'Aguardando envio ao RH' }).label).toBe('Enviando ao RH');
    expect(situacaoParaTela({ envio: 'COM_PROBLEMA', rhSituacao: null, situacaoRotulo: '' })).toEqual({ label: 'Envio em revisão pelo Administrador', tone: 'critical' });
    expect(situacaoParaTela({ envio: 'ENVIADO', rhSituacao: 'concluido', situacaoRotulo: 'Concluído' })).toEqual({ label: 'Concluído', tone: 'success' });
  });
});
