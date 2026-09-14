import { describe, it, expect } from 'vitest';
import { unwrapColaboradores, unwrapUnidades, isAtivo, RhFormatoInesperadoError } from '@/lib/rh/normalize';

/**
 * A leitura da resposta do RH.
 *
 * O caso que motivou este arquivo: `unwrapColaboradores` devolvia `[]` para
 * QUALQUER formato que não entendesse. Quem chama — o sync — usa a lista para
 * decidir quem inativar, e não tinha como distinguir "esta unidade não tem
 * ninguém" de "o RH trocou o envelope e eu não li nada". As duas coisas
 * chegavam iguais, e a segunda apagava a unidade.
 */

describe('Lista de colaboradores', () => {
  it('lê o envelope { data: [...] }', () => {
    const resp = { data: [{ matricula: '1', nome: 'ALESSANDRA', cpf: null, status: 'Ativo', unidade: 'X', cargo: null, admissao: null }] };
    expect(unwrapColaboradores(resp)).toHaveLength(1);
  });

  it('lista VAZIA é uma resposta legítima — devolve []', () => {
    /* Unidade recém-aberta, ou sem ninguém no RH. Isso é um dado, não um erro:
       quem decide o que fazer com o vazio é o sync. */
    expect(unwrapColaboradores({ data: [] })).toEqual([]);
  });

  it('formato irreconhecível LANÇA — não vira lista vazia', () => {
    /* Cada um destes já passou por "[]" e teria feito o sync inativar a unidade
       inteira achando que o RH devolveu zero pessoas. */
    const formatosEstranhos = [
      { colaboradores: [{ matricula: '1' }] },        // envelope renomeado
      { data: { items: [{ matricula: '1' }] } },      // lista aninhada
      { success: true },                               // sem data
      { success: false, error: 'Unauthorized' },       // erro que escapou do cliente
      [],                                              // array na raiz, sem envelope
      null,
      'texto solto',
    ];
    for (const r of formatosEstranhos) {
      expect(() => unwrapColaboradores(r), JSON.stringify(r)).toThrow(RhFormatoInesperadoError);
    }
  });

  it('a mensagem do erro mostra o que chegou — senão não há como investigar', () => {
    try {
      unwrapColaboradores({ colaboradores: [] });
      expect.unreachable('deveria ter lançado');
    } catch (e) {
      expect((e as Error).message).toContain('colaboradores');
      expect((e as Error).message).toContain('{ data: [...] }');
    }
  });
});

describe('Lista de unidades', () => {
  it('lê o envelope e ignora o que não for lista', () => {
    expect(unwrapUnidades({ data: ['A', 'B'] })).toEqual(['A', 'B']);
    /* Aqui o `[]` continua sendo seguro: nenhuma decisão destrutiva depende
       desta lista — ela só preenche um seletor na tela. */
    expect(unwrapUnidades({ outra: 1 })).toEqual([]);
  });
});

describe('Status do colaborador', () => {
  it('reconhece as variações de "ativo" que o RH manda', () => {
    for (const s of ['Ativo', 'ATIVO', ' ativo ', 'Ativa']) expect(isAtivo(s), s).toBe(true);
  });

  it('e trata o resto como inativo, inclusive vazio', () => {
    for (const s of ['Demitido', 'Afastado', 'Férias', '', null, undefined]) expect(isAtivo(s), String(s)).toBe(false);
  });
});
