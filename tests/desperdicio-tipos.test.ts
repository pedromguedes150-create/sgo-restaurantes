import { describe, it, expect } from 'vitest';
import {
  TIPOS_DE_DESPERDICIO, GRUPOS, totaisDoDia, variacaoPct, tipoPorCodigo, ehTipoFixo,
} from '@/lib/waste/tipos';

/**
 * Os seis tipos e os três totais.
 *
 * A conta é simples; o que se protege aqui é outra coisa. O `code` é o que
 * viaja para o banco: renomeá-lo desliga silenciosamente todos os lançamentos
 * já gravados daquele tipo — eles continuam no banco e param de entrar nos
 * totais, sem erro em lugar nenhum. Por isso os códigos estão escritos à mão no
 * teste, e não lidos da própria lista: assim mudar um deles QUEBRA aqui.
 */

describe('A lista fechada', () => {
  it('tem exatamente os seis, com os códigos que o banco guarda', () => {
    expect(TIPOS_DE_DESPERDICIO.map((t) => t.code)).toEqual([
      'SS_ALMOCO', 'SS_JANTAR', 'REF_ALMOCO', 'REF_JANTAR', 'PROD_ALMOCO', 'PROD_JANTAR',
    ]);
  });

  it('os grupos cobrem todos os seis, sem sobra nem repetição', () => {
    const nosGrupos = GRUPOS.flatMap((g) => g.codes).sort();
    expect(nosGrupos).toEqual(TIPOS_DE_DESPERDICIO.map((t) => t.code).sort());
    expect(new Set(nosGrupos).size).toBe(6);
  });

  it('os rótulos são os que a rede usa (v1.121.0: os do Pedro)', () => {
    expect(GRUPOS[0].label).toBe('Total Sobra Limpa (kg)');
    expect(GRUPOS[1].label).toBe('Total Sobra de Produção (kg)');
  });

  it('reconhece o que é e o que não é tipo fixo', () => {
    expect(ehTipoFixo('SS_ALMOCO')).toBe(true);
    expect(ehTipoFixo('CATEGORIA_ANTIGA')).toBe(false);
    expect(tipoPorCodigo('PROD_JANTAR')?.grupo).toBe('SOBRA_PRODUCAO');
    expect(tipoPorCodigo('nao-existe')).toBeNull();
  });
});

describe('Os três totais', () => {
  it('somam cada grupo e o geral', () => {
    const t = totaisDoDia({
      SS_ALMOCO: 10, SS_JANTAR: 5, REF_ALMOCO: 2, REF_JANTAR: 3,
      PROD_ALMOCO: 4, PROD_JANTAR: 1,
    });
    expect(t.sobraLimpa).toBe(20);
    expect(t.sobraProducao).toBe(5);
    expect(t.geral).toBe(25);
  });

  it('tipo não lançado conta zero, não quebra a soma', () => {
    const t = totaisDoDia({ SS_ALMOCO: 7 });
    expect(t.sobraLimpa).toBe(7);
    expect(t.sobraProducao).toBe(0);
    expect(t.geral).toBe(7);
    expect(t.porCodigo.PROD_JANTAR).toBe(0);
  });

  it('CATEGORIA ANTIGA no meio não infla o total da rede', () => {
    /* O caso real: as unidades lançaram meses em categorias livres antes da
       virada. Se o geral fosse "a soma de tudo que veio", um resíduo dessas
       faria uma unidade parecer pior que as outras sem ninguém entender. */
    const t = totaisDoDia({ SS_ALMOCO: 10, BUFFET_ANTIGO: 999 });
    expect(t.geral).toBe(10);
    expect(t.porCodigo.BUFFET_ANTIGO).toBeUndefined();
  });

  it('lixo no lugar do número vira zero, não NaN', () => {
    const t = totaisDoDia({ SS_ALMOCO: Number.NaN, SS_JANTAR: undefined as unknown as number });
    expect(t.geral).toBe(0);
    expect(Number.isNaN(t.geral)).toBe(false);
  });
});

describe('A variação entre dois meses', () => {
  it('sobe e desce com o sinal certo', () => {
    expect(variacaoPct(150, 100)).toBe(50);
    expect(variacaoPct(50, 100)).toBe(-50);
    expect(variacaoPct(100, 100)).toBe(0);
  });

  it('sem base de comparação devolve null — não "+100%"', () => {
    /* Dizer que subiu 100% a partir do zero é inventar uma tendência que o dado
       não sustenta, e num painel de desperdício isso vira cobrança em cima de
       número que não existe. */
    expect(variacaoPct(80, 0)).toBeNull();
    expect(variacaoPct(0, 0)).toBeNull();
  });

  it('cair para zero é -100%, e isso o dado sustenta', () => {
    expect(variacaoPct(0, 40)).toBe(-100);
  });
});
