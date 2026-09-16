import { describe, it, expect } from 'vitest';
import { numeroDoPedido } from '@/lib/products/numero-do-pedido';
import { DIVERGENCIAS, divergenciaLabel, ehDivergencia } from '@/lib/products/entrega-tela';

/**
 * Quatro acertos contra a especificação escrita — coisas que a entrega original
 * deixou passar. Cada bloco aqui existe porque a falta dele tinha consequência
 * na operação, não porque o texto pedia.
 */

describe('A etiqueta do pedido', () => {
  it('é PED-ano-seis dígitos', () => {
    expect(numeroDoPedido(1245, new Date('2026-09-15T12:00:00'))).toBe('PED-2026-001245');
  });

  it('usa o ano DO PEDIDO, não o de hoje', () => {
    /* Reimprimir em janeiro o romaneio de um pedido de dezembro não pode
       renomear o pedido — a etiqueta é a identidade dele. */
    expect(numeroDoPedido(7, new Date('2025-12-31T23:00:00'))).toBe('PED-2025-000007');
  });

  it('não muda de largura quando o número cresce', () => {
    /* Largura fixa é o que faz a lista ordenar certo e a coluna não dançar. */
    expect(numeroDoPedido(9, new Date('2026-01-01T00:00:00'))).toHaveLength('PED-2026-000000'.length);
    expect(numeroDoPedido(123456, new Date('2026-01-01T00:00:00'))).toHaveLength('PED-2026-000000'.length);
  });

  it('aceita a data como texto, que é como ela chega do JSON', () => {
    expect(numeroDoPedido(12, '2026-03-04T10:00:00')).toBe('PED-2026-000012');
  });

  it('com data inválida ainda devolve uma etiqueta utilizável', () => {
    /* Quebrar a impressão do romaneio por causa de uma data ruim seria trocar
       um defeito pequeno por um que para a doca. */
    expect(numeroDoPedido(12, 'data-quebrada')).toMatch(/^PED-\d{4}-000012$/);
  });
});

describe('Os motivos de divergência', () => {
  it('separam a avaria da EMBALAGEM da avaria do PRODUTO', () => {
    /* Caixa amassada com produto íntegro se resolve com o transporte; produto
       estragado, com o fornecedor. Um motivo só apagaria essa diferença. */
    expect(ehDivergencia('EMBALAGEM')).toBe(true);
    expect(ehDivergencia('AVARIADO')).toBe(true);
    expect(ehDivergencia('ESTRAGADO')).toBe(true);
    expect(divergenciaLabel('EMBALAGEM')).toBe('Embalagem danificada');
  });

  it('cobrem a lista inteira que a operação usa', () => {
    const ids = DIVERGENCIAS.map((d) => d.id);
    for (const esperado of ['NAO_VEIO', 'VEIO_MENOS', 'VEIO_MAIS', 'AVARIADO', 'EMBALAGEM', 'ESTRAGADO', 'QUALIDADE', 'VALIDADE', 'TROCADO', 'OUTRO']) {
      expect(ids).toContain(esperado);
    }
  });

  it('não têm id repetido', () => {
    const ids = DIVERGENCIAS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('continuam recusando motivo inventado', () => {
    expect(ehDivergencia('SUMIU_NO_CAMINHO')).toBe(false);
  });
});
