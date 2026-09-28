import { describe, it, expect } from 'vitest';
import { lerFiltrosDaLista, linkDaLista, ordenacaoDaLista, voltarSeguro } from '@/lib/occurrences/contexto';

/**
 * OCORRÊNCIAS — o contexto da lista na URL (v1.128.0).
 * É o que faz "encerrar" devolver o supervisor a ABERTAS com os mesmos filtros.
 */

describe('filtros na URL', () => {
  it('ida e volta sem perder situação, assunto, busca, unidade, gravidade, ordem e página', () => {
    const url = '/modulos/ocorrencias?view=manutencao&status=OPEN&q=placa&unidade=u1&gravidade=MEDIUM&ordem=gravidade&pagina=2';
    const f = lerFiltrosDaLista(new URL(url, 'http://x').searchParams);
    expect(f).toEqual({ view: 'manutencao', status: 'OPEN', q: 'placa', unitId: 'u1', gravity: 'MEDIUM', ordem: 'gravidade', pagina: 2 });
    expect(linkDaLista(f)).toBe(url);
  });

  it('valor inválido cai no padrão, e o padrão não polui o endereço', () => {
    const f = lerFiltrosDaLista(new URLSearchParams('status=X&gravidade=Y&ordem=Z&pagina=-3'));
    expect(f).toEqual({ view: undefined, status: undefined, q: undefined, unitId: undefined, gravity: undefined, ordem: 'recentes', pagina: 1 });
    expect(linkDaLista(f)).toBe('/modulos/ocorrencias');
  });
});

describe('voltar só para dentro da lista', () => {
  it('aceita o endereço da lista com filtros', () => {
    expect(voltarSeguro('/modulos/ocorrencias?status=OPEN&unidade=u1')).toBe('/modulos/ocorrencias?status=OPEN&unidade=u1');
  });
  it('recusa endereço externo ou de outra tela (redirecionamento aberto)', () => {
    for (const v of ['https://x.com', '//x.com', '/modulos/pagamentos', '/modulos/ocorrencias?x=http://y', '', undefined]) {
      expect(voltarSeguro(v), v).toBeNull();
    }
  });
});

describe('ordenação', () => {
  it('cada escolha vira um ORDER BY, com desempate por data', () => {
    expect(ordenacaoDaLista('recentes')).toEqual([{ createdAt: 'desc' }]);
    expect(ordenacaoDaLista('antigas')).toEqual([{ createdAt: 'asc' }]);
    expect(ordenacaoDaLista('gravidade')).toEqual([{ gravity: 'desc' }, { createdAt: 'desc' }]);
    expect(ordenacaoDaLista('unidade')).toEqual([{ unit: { name: 'asc' } }, { createdAt: 'desc' }]);
  });
});
