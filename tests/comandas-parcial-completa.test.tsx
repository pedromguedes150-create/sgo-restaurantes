import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/configuracoes/comandas' }));

import React from 'react';
import { renderToString } from 'react-dom/server';
import { rotuloDosNumeros } from '@/lib/commands/ranges';
import { CommandsConfigAdmin, type CmdSeqRow } from '@/components/admin/commands-config-admin';
import { IniciarConferencia } from '@/components/commands/iniciar-conferencia';
import { TIPO_LABEL } from '@/lib/commands/sessao';

/**
 * v1.213.0 — PARCIAL × COMPLETA com os nomes da operação. "Madrugada" e "Só na
 * semanal" não diziam nada para quem confere as duas de madrugada (Daniel, 18/11).
 */
const sem = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
const faixa = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);
const seq = (over: Partial<CmdSeqRow>): CmdSeqRow => ({ id: 's', unitId: 'u1', name: 'SEMANA', rangeStart: 1, rangeEnd: 300, active: true, nightly: true, ...over });
const units = [{ id: 'u1', name: 'Nova União' }];

describe('os números escritos como gente fala', () => {
  it('um trecho, dois trechos, número solto e vazio', () => {
    expect(rotuloDosNumeros(faixa(1, 300))).toBe('1 a 300');
    expect(rotuloDosNumeros([...faixa(1, 300), ...faixa(501, 600)])).toBe('1 a 300 e 501 a 600');
    expect(rotuloDosNumeros([5, 1, 2, 3, 9])).toBe('1 a 3, 5 e 9');
    expect(rotuloDosNumeros([])).toBe('');
  });
});

describe('Configurações → Comandas', () => {
  it('mostra o resultado: parcial 1 a 300 e completa 1 a 500, com os selos novos', () => {
    const h = sem(renderToString(<CommandsConfigAdmin units={units} sequences={[seq({}), seq({ id: 't', name: 'COMPLETA', rangeStart: 301, rangeEnd: 500, nightly: false })]} />));
    expect(h).toContain('data-testid="resumo-parcial-completa"');
    expect(h).toContain('1 a 300');
    expect(h).toContain('300 comandas');
    expect(h).toContain('1 a 500');
    expect(h).toContain('Parcial e completa');
    expect(h).toContain('Só na completa');
    expect(h).not.toContain('Madrugada');
    expect(h).not.toContain('semanal');
  });
  it('as duas marcadas = parcial igual à completa, e a tela diz o que fazer', () => {
    const h = sem(renderToString(<CommandsConfigAdmin units={units} sequences={[seq({}), seq({ id: 't', rangeStart: 301, rangeEnd: 500 })]} />));
    expect(h).toContain('Igual à completa');
  });
  it('nenhuma marcada = parcial não configurada', () => {
    const h = sem(renderToString(<CommandsConfigAdmin units={units} sequences={[seq({ nightly: false }), seq({ id: 't', rangeStart: 301, rangeEnd: 500, nightly: false })]} />));
    expect(h).toContain('Não configurada');
  });
});

describe('o que o gerente vê', () => {
  it('o tipo se chama Parcial em todo lugar', () => {
    expect(TIPO_LABEL.FAIXA_DO_DIA).toBe('Parcial');
    expect(TIPO_LABEL.COMPLETA).toBe('Completa');
  });
  it('a tela de início recebe os dois rótulos (o diálogo abre só no toque)', () => {
    const h = sem(renderToString(<IniciarConferencia unitId="u1" ultima={null} emAndamento={null} faixaDoDia={faixa(1, 300)} rotuloParcial="1 a 300" rotuloCompleta="1 a 500" totalCompleta={500} />));
    expect(h).toContain('Iniciar nova conferência');
  });
});
