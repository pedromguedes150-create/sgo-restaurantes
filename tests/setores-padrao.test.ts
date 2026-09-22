import { describe, it, expect } from 'vitest';
import { faltantesDoRomaneio, SETORES_DO_ROMANEIO } from '@/lib/products/setores-padrao';
import { sugerirSetorPorRegra } from '@/lib/stock/setor-sugerido';

/**
 * OS SETORES DO ROMANEIO.
 *
 * O classificador só aponta para setor que EXISTA no cadastro. O risco deste
 * seed não é criar de menos — é criar DUPLICADO: "Secos" e "DESPENSA COZINHA"
 * são o mesmo lugar, e dois setores para a mesma mercadoria partem a carga
 * entre duas filas, com dois separadores conferindo metade cada um. Ninguém vê
 * erro; o que chega incompleto é o caminhão.
 *
 * Sem banco de propósito: `cd_sectors` é tabela GLOBAL, sem escopo por unidade.
 * Um teste que a limpasse derrubaria, rodando em paralelo, os setores que os
 * outros arquivos acabaram de criar — e a falha apareceria no arquivo errado.
 */

const setor = (name: string, id = name) => ({ id, name });

describe('O que falta criar', () => {
  it('do zero, faltam os oito', () => {
    const q = faltantesDoRomaneio([]);
    expect(q.faltando).toHaveLength(SETORES_DO_ROMANEIO.length);
    expect(q.cobertos).toEqual([]);
  });

  it('NÃO propõe um conceito que já tem setor com outro nome', () => {
    /* É o caso real: o cadastro tinha "Secos", que é a despensa. */
    const q = faltantesDoRomaneio([setor('Secos')]);
    expect(q.faltando.some((f) => f.nome === 'DESPENSA COZINHA')).toBe(false);
    expect(q.cobertos.find((c) => c.nome === 'DESPENSA COZINHA')?.por).toBe('Secos');
  });

  it('reconhece o equivalente com grafia diferente', () => {
    const q = faltantesDoRomaneio([setor('Açougue'), setor('Câmara Fria'), setor('Bebidas Geladas')]);
    const faltam = q.faltando.map((f) => f.nome);
    expect(faltam).not.toContain('CARNES CHURRASCO');
    expect(faltam).not.toContain('CÂMARAS FRIAS');
    expect(faltam).not.toContain('BEBIDAS');
    /* E o que não tem equivalente continua faltando. */
    expect(faltam).toContain('SALGADOS');
  });

  it('com os oito já cadastrados, não falta nada', () => {
    const q = faltantesDoRomaneio(SETORES_DO_ROMANEIO.map((s) => setor(s.nome)));
    expect(q.faltando).toEqual([]);
  });

  it('o cadastro que a rede tinha (3 setores) deixa 5 faltando', () => {
    /* Bebidas, Secos e Descartáveis cobrem três conceitos; sobram carnes,
       câmaras frias, salgados, confeitaria e bomboniere. */
    const q = faltantesDoRomaneio([setor('Bebidas'), setor('Secos'), setor('Descartáveis')]);
    expect(q.faltando.map((f) => f.nome).sort()).toEqual(
      ['BOMBONIERE DIVERSOS', 'CARNES CHURRASCO', 'CONFEITARIA', 'CÂMARAS FRIAS', 'SALGADOS'].sort(),
    );
  });
});

describe('Cada nome proposto realmente atende o seu conceito', () => {
  it('criar os oito faz o classificador ter para onde apontar', () => {
    /* A prova de que a lista não é decorativa: com ela no cadastro, um produto
       de cada setor do romaneio encontra o destino certo. */
    const setores = SETORES_DO_ROMANEIO.map((s) => setor(s.nome));
    const casos: [string, string][] = [
      ['Coca-Cola 2L', 'BEBIDAS'],
      ['Chiclete Trident Menta', 'BOMBONIERE DIVERSOS'],
      ['2 cxs alcatra', 'CARNES CHURRASCO'],
      ['10 cxs pão de queijo', 'CÂMARAS FRIAS'],
      ['1 cx coxinha frango requeijão', 'SALGADOS'],
      ['3 Bolos cenoura', 'CONFEITARIA'],
      ['4 fds arroz sempre bom', 'DESPENSA COZINHA'],
      ['5 cxs palitos dentes', 'DESCARTÁVEIS'],
    ];
    for (const [produto, esperado] of casos) {
      expect(sugerirSetorPorRegra(produto, setores)?.sectorName, produto).toBe(esperado);
    }
  });

  it('nenhum nome proposto cobre DOIS conceitos ao mesmo tempo', () => {
    /* Se "CÂMARAS FRIAS" também casasse com o apelido de outro conceito, criar
       um setor apagaria a necessidade do outro, em silêncio. */
    for (const s of SETORES_DO_ROMANEIO) {
      const q = faltantesDoRomaneio([setor(s.nome)]);
      expect(q.cobertos.map((c) => c.nome), s.nome).toEqual([s.nome]);
    }
  });
});
