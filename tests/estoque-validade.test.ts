import { describe, it, expect } from 'vitest';
import { bandaDaFaixa, diasEntre, faixaDaValidade, ordemDeUrgencia, precisaTratativa } from '@/lib/stock/validade';
import { descreverQuantidade, emPacotes, emUnidades, fatorDaEmbalagem } from '@/lib/stock/embalagem';

/**
 * A VALIDADE E A EMBALAGEM.
 *
 * As duas regras que o resto do módulo assume como verdade. Elas são puras de
 * propósito: a faixa depende do dia de HOJE, e sem poder passar o dia não haveria
 * como provar a véspera sem esperar o relógio virar.
 */

const HOJE = '2026-09-22';

describe('Dias entre duas datas', () => {
  it('conta dias inteiros, sem fuso', () => {
    expect(diasEntre('2026-09-22', '2026-09-29')).toBe(7);
    expect(diasEntre('2026-09-22', '2026-09-22')).toBe(0);
    expect(diasEntre('2026-09-22', '2026-09-20')).toBe(-2);
  });

  it('atravessa a virada do mês e do ano', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    /* 2028 é bissexto: fevereiro tem 29. */
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('data inválida devolve null, e não NaN', () => {
    expect(diasEntre('', '2026-09-22')).toBeNull();
    expect(diasEntre('22/09/2026', '2026-09-22')).toBeNull();
  });
});

describe('A escalada de faixas', () => {
  const faixa = (data: string, alertDays = 30) => faixaDaValidade(data, HOJE, alertDays);

  it('vencido pede tratativa e diz há quantos dias', () => {
    const f = faixa('2026-09-20')!;
    expect(f.chave).toBe('VENCIDO');
    expect(f.tom).toBe('danger');
    expect(f.rotulo).toContain('2 dias');
    expect(f.rotulo).toContain('tratativa');
  });

  it('vence hoje', () => {
    expect(faixa('2026-09-22')!.chave).toBe('HOJE');
    expect(faixa('2026-09-22')!.rotulo).toBe('Vence hoje');
  });

  it('vence amanhã diz "amanhã", e não "em 1 dias"', () => {
    /* O infográfico pede esta frase literal, e ela é a que o gerente entende
       sem converter nada. */
    expect(faixa('2026-09-23')!.rotulo).toBe('Vence amanhã');
    expect(faixa('2026-09-23')!.chave).toBe('CRITICO');
  });

  it('2 dias ainda é crítico; 3 já é atenção', () => {
    expect(faixa('2026-09-24')!.chave).toBe('CRITICO');
    expect(faixa('2026-09-25')!.chave).toBe('ATENCAO');
    expect(faixa('2026-09-29')!.chave).toBe('ATENCAO');
    expect(faixa('2026-09-30')!.chave).toBe('PROXIMO');
  });

  it('longe demais não é faixa nenhuma — e null NÃO é "próximo"', () => {
    /* `null` some das listas de alerta. Se virasse PROXIMO, o painel mostraria
       o catálogo inteiro e o alerta deixaria de significar algo. */
    expect(faixa('2026-12-20')).toBeNull();
  });
});

describe('A antecedência é do PRODUTO, a escalada é fixa', () => {
  it('produto de 15 dias só entra no radar aos 15', () => {
    expect(faixaDaValidade('2026-10-10', HOJE, 15)).toBeNull();      // 18 dias
    expect(faixaDaValidade('2026-10-05', HOJE, 15)!.chave).toBe('PROXIMO'); // 13 dias
  });

  it('produto de 60 dias já acende aos 45', () => {
    expect(faixaDaValidade('2026-11-06', HOJE, 60)!.chave).toBe('PROXIMO');
    expect(faixaDaValidade('2026-11-06', HOJE, 30)).toBeNull();
  });

  it('janela curta NÃO cala as faixas graves', () => {
    /* Um produto cadastrado com antecedência de 1 dia continua ficando crítico
       a 2 dias do vencimento. Se a configuração pudesse esconder o vermelho,
       ela viraria um jeito de desligar o alarme sem ninguém perceber. */
    expect(faixaDaValidade('2026-09-24', HOJE, 1)!.chave).toBe('CRITICO');
    expect(faixaDaValidade('2026-09-20', HOJE, 1)!.chave).toBe('VENCIDO');
    expect(faixaDaValidade('2026-09-26', HOJE, 1)!.chave).toBe('ATENCAO');
  });
});

describe('Quando perguntar ao gerente', () => {
  const lote = (over: Partial<{ status: string; expiresAt: string | null; lastReviewBand: string | null }> = {}) => ({
    status: 'OPEN', expiresAt: '2026-09-25', lastReviewBand: null, ...over,
  });

  it('pergunta quando o lote entra numa faixa', () => {
    expect(precisaTratativa(lote(), HOJE)).toBe(true);
  });

  it('NÃO repete a pergunta na mesma faixa', () => {
    /* Alerta que se repete todo dia ensina a ignorar o alerta. */
    expect(precisaTratativa(lote({ lastReviewBand: 'ATENCAO' }), HOJE)).toBe(false);
  });

  it('volta a perguntar quando a situação PIORA de faixa', () => {
    /* Respondeu "ainda tenho estoque" a 30 dias; a 2 dias a pergunta é outra. */
    expect(precisaTratativa({ status: 'OPEN', expiresAt: '2026-09-23', lastReviewBand: 'PROXIMO' }, HOJE)).toBe(true);
  });

  it('lote encerrado nunca mais pergunta', () => {
    for (const status of ['FINISHED', 'DISCARDED', 'TRANSFERRED']) {
      expect(precisaTratativa(lote({ status }), HOJE)).toBe(false);
    }
  });

  it('lote sem validade não gera pergunta', () => {
    expect(precisaTratativa(lote({ expiresAt: null }), HOJE)).toBe(false);
  });

  it('a banda gravada é a chave da faixa', () => {
    expect(bandaDaFaixa(faixaDaValidade('2026-09-23', HOJE))).toBe('CRITICO');
    expect(bandaDaFaixa(null)).toBeNull();
  });
});

describe('Ordem da tela', () => {
  it('o que vence antes vem primeiro, e sem validade vai para o fim', () => {
    const lista = [{ expiresAt: null }, { expiresAt: '2026-10-01' }, { expiresAt: '2026-09-23' }];
    expect([...lista].sort(ordemDeUrgencia).map((l) => l.expiresAt)).toEqual(['2026-09-23', '2026-10-01', null]);
  });
});

describe('Embalagem', () => {
  it('5 fardos de 12 são 60 unidades', () => {
    expect(emUnidades(5, 'FARDO', 12)).toBe(60);
  });

  it('display de 21 chicletes', () => {
    expect(emUnidades(3, 'DISPLAY', 21)).toBe(63);
  });

  it('unidade avulsa não multiplica nada', () => {
    expect(emUnidades(12, 'UN', 21)).toBe(12);
    expect(fatorDaEmbalagem('UN', 99)).toBe(1);
  });

  it('fator inválido vira 1 em vez de zerar o estoque', () => {
    /* Com fator 0, `5 fardos` viraria 0 unidades — o gerente lançaria o
       recebimento e o saldo ficaria vazio, sem erro nenhum na tela. */
    expect(fatorDaEmbalagem('FARDO', 0)).toBe(1);
    expect(fatorDaEmbalagem('FARDO', null)).toBe(1);
    expect(emUnidades(5, 'FARDO', 0)).toBe(5);
  });

  it('a volta traz a sobra explícita, porque existe fardo aberto', () => {
    expect(emPacotes(60, 'FARDO', 12)).toEqual({ pacotes: 5, sobra: 0 });
    expect(emPacotes(64, 'FARDO', 12)).toEqual({ pacotes: 5, sobra: 4 });
    /* "5,3 fardos" descreveria algo que ninguém consegue contar na prateleira. */
  });

  it('o texto mostra as DUAS leituras', () => {
    expect(descreverQuantidade(60, 'FARDO', 12)).toBe('5 fardos · 60 un');
    expect(descreverQuantidade(64, 'FARDO', 12)).toBe('5 fardos + 4 un · 64 un');
    expect(descreverQuantidade(12, 'FARDO', 12)).toBe('1 fardo · 12 un');
  });

  it('sobrando menos que um fardo, só as unidades — "0 fardos" não ajuda ninguém', () => {
    expect(descreverQuantidade(7, 'FARDO', 12)).toBe('7 un');
  });

  it('produto por unidade mostra só unidades', () => {
    expect(descreverQuantidade(24, 'UN', 1)).toBe('24 un');
  });
});
