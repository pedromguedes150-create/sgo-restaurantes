import { describe, it, expect } from 'vitest';
import { textoDeOcorrencias } from '@/lib/dashboard/attention-text';

/**
 * A frase do cartão "Precisa da sua atenção" — o lugar mais visível do sistema.
 *
 * O defeito: o assunto ("ocorrência(s)") só aparecia no trecho das críticas.
 * Com zero críticas — o caso comum — sobrava "141 aberta(s) há mais de 48h.",
 * uma frase sem sujeito. Aberta o quê?
 */

describe('textoDeOcorrencias', () => {
  it('só antigas: a frase diz DO QUE se trata', () => {
    expect(textoDeOcorrencias(0, 141)).toBe('141 ocorrência(s) aberta(s) há mais de 48h.');
  });

  it('só críticas', () => {
    expect(textoDeOcorrencias(3, 0)).toBe('3 ocorrência(s) crítica(s) aberta(s).');
  });

  it('as duas: o assunto aparece uma vez só', () => {
    const t = textoDeOcorrencias(3, 141)!;
    expect(t).toBe('3 ocorrência(s) crítica(s) aberta(s) · 141 aberta(s) há mais de 48h.');
    /* Repetir "ocorrência(s)" duas vezes na mesma linha cansa a leitura de um
       cartão que existe para ser lido de relance. */
    expect(t.match(/ocorrência/g)).toHaveLength(1);
  });

  it('nada a dizer: nada é dito', () => {
    expect(textoDeOcorrencias(0, 0)).toBeNull();
  });

  it('toda frase termina em ponto e nenhuma começa por número solto sem assunto', () => {
    for (const [c, a] of [[0, 1], [1, 0], [2, 3]] as const) {
      const t = textoDeOcorrencias(c, a)!;
      expect(t.endsWith('.')).toBe(true);
      expect(t).toContain('ocorrência');
    }
  });

  it('números estranhos não quebram a frase', () => {
    expect(textoDeOcorrencias(-5, 0)).toBeNull();
    expect(textoDeOcorrencias(0, 2.7)).toBe('2 ocorrência(s) aberta(s) há mais de 48h.');
  });
});
