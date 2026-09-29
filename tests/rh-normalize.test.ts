import { describe, it, expect } from 'vitest';
import { unwrapColaboradores, unwrapUnidades, isAtivo, classificarStatus, RhFormatoInesperadoError } from '@/lib/rh/normalize';

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
  /* ATENÇÃO ao ler o histórico deste arquivo: a versão anterior deste bloco
     afirmava que "Férias" e "Afastado" deviam ser INATIVOS. Aquilo não era a
     regra — era o BUG, escrito como se fosse especificação. O teste passava e
     cimentava o defeito: quem escreve o teste olhando só para o código acaba
     descrevendo o que ele faz, não o que ele deveria fazer.

     A regra de verdade apareceu na tela de diagnóstico, com dado real de
     Jardim Teresópolis: o RH devolve "1ª Experiência" e "2ª Experiência" para
     quem está no período de experiência, e OITO pessoas que estavam
     trabalhando tinham sumido do SGO. */

  it('quem está trabalhando aparece — inclusive em período de experiência', () => {
    const trabalhando = [
      'Ativo', 'ATIVO', ' ativo ', 'Ativa',
      '1ª Experiência', '2ª Experiência', '3ª Experiência',  // os status reais do RH
      '1a experiencia', 'CONTRATO DE EXPERIENCIA',
    ];
    for (const s of trabalhando) expect(isAtivo(s), s).toBe(true);
    for (const s of trabalhando) expect(classificarStatus(s), s).toBe('ATIVO');
  });

  it('só sai do SGO quem está claramente desligado', () => {
    for (const s of ['Demitido', 'Desligado', 'Rescisão', 'RESCINDIDO', 'Inativo', 'Cancelado']) {
      expect(classificarStatus(s), s).toBe('DESLIGADO');
      expect(isAtivo(s), s).toBe(false);
    }
  });

  it('status DESCONHECIDO mantém a pessoa visível — sumir é pior do que sobrar', () => {
    /* Uma pessoa a mais na tela é visível e alguém corrige. Uma pessoa a menos
       é invisível, e ninguém procura o que não sabe que falta. Foi exatamente
       assim que as 8 de Jardim Teresópolis passaram despercebidas. */
    for (const s of ['Afastado', 'Férias', 'Licença Maternidade', 'Coisa que o RH inventar', '', null, undefined]) {
      expect(classificarStatus(s), String(s)).toBe('DESCONHECIDO');
      expect(isAtivo(s), String(s)).toBe(true);
    }
  });
});
