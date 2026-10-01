import { describe, it, expect } from 'vitest';
import {
  normalizarDados, rascunhoDaResposta, diferencas, buscarFichas, textoQuantidade, textoPeso, numero,
  type DadosDaFicha,
} from '@/lib/preparo/tipos';

/**
 * PADRONIZAÇÃO DE PREPARO — o núcleo puro. O que se prova: a ficha válida é a
 * do exemplo real (Pão c/ Linguiça Completo); a leitura da IA NUNCA inventa
 * valor; o histórico fala a língua de quem lê; a busca acha pelo ingrediente.
 */

const paoLinguica = (): DadosDaFicha => ({
  name: 'Pão c/ Linguiça Completo', code: '910000000501', category: 'Pão Francês',
  preparationMethod: null, generalNotes: null,
  items: [
    { ingredientName: 'Pão Francês', quantity: 1, unit: 'Unid', weightGrams: 65, notes: null },
    { ingredientName: 'Linguiça', quantity: 2, unit: 'fatias', weightGrams: 120, notes: 'Fatia na largura da espátula' },
    { ingredientName: 'Saco para Lanche', quantity: 1, unit: 'Unid', weightGrams: null, notes: null },
    { ingredientName: 'Queijo Minas', quantity: 1, unit: 'fatia', weightGrams: 60, notes: null },
    { ingredientName: 'Ovo frito', quantity: 1, unit: 'Unid', weightGrams: 45, notes: null },
    { ingredientName: 'Alface', quantity: 1, unit: 'Folha', weightGrams: 15, notes: null },
    { ingredientName: 'Tomate', quantity: 1, unit: 'Fatia', weightGrams: 40, notes: null },
  ],
});

describe('normalizarDados — o que vem do formulário vira ficha, ou diz o que falta', () => {
  it('aceita a ficha do exemplo real, com textos vindos como string ("0,5", "65")', () => {
    const r = normalizarDados({
      name: '  Pão c/ Linguiça Completo ', code: ' 9100 0000 0501 ', category: '',
      items: [
        { ingredientName: 'Linguiça', quantity: '2', unit: 'fatias', weightGrams: '120', notes: 'Fatia na largura da espátula' },
        { ingredientName: 'Manteiga', quantity: '0,5', unit: 'colher', weightGrams: '', notes: '' },
        { ingredientName: '', quantity: '', unit: '', weightGrams: '', notes: '' }, // linha sobrando do editor
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.name).toBe('Pão c/ Linguiça Completo');
    expect(r.dados.code).toBe('910000000501');
    expect(r.dados.category).toBe('Geral');
    expect(r.dados.items).toHaveLength(2);
    expect(r.dados.items[0]).toMatchObject({ quantity: 2, weightGrams: 120, notes: 'Fatia na largura da espátula' });
    expect(r.dados.items[1]).toMatchObject({ quantity: 0.5, weightGrams: null, notes: null });
  });

  it('nome e código são obrigatórios', () => {
    expect(normalizarDados({ name: '', code: '1', items: [] })).toMatchObject({ ok: false, motivo: 'SEM_NOME' });
    expect(normalizarDados({ name: 'X', code: '', items: [] })).toMatchObject({ ok: false, motivo: 'SEM_CODIGO' });
    expect(normalizarDados(null)).toMatchObject({ ok: false, motivo: 'FORMATO' });
  });

  it('número ilegível é RECUSADO e aponta o campo — nunca arredondado para zero', () => {
    const q = normalizarDados({ name: 'X', code: '1', items: [{ ingredientName: 'A', quantity: 'duas', unit: '', weightGrams: '', notes: '' }] });
    expect(q).toMatchObject({ ok: false, motivo: 'QUANTIDADE', campo: 'items.0.quantity' });
    const p = normalizarDados({ name: 'X', code: '1', items: [{ ingredientName: 'A', quantity: '1', unit: '', weightGrams: '65g', notes: '' }] });
    expect(p).toMatchObject({ ok: false, motivo: 'PESO', campo: 'items.0.weightGrams' });
    const neg = normalizarDados({ name: 'X', code: '1', items: [{ ingredientName: 'A', quantity: '-1', unit: '', weightGrams: '', notes: '' }] });
    expect(neg).toMatchObject({ ok: false, motivo: 'QUANTIDADE' });
  });

  it('ingrediente com quantidade e sem nome é recusado (não é linha vazia)', () => {
    const r = normalizarDados({ name: 'X', code: '1', items: [{ ingredientName: '', quantity: '1', unit: 'Unid', weightGrams: '', notes: '' }] });
    expect(r).toMatchObject({ ok: false, motivo: 'INGREDIENTE_SEM_NOME', campo: 'items.0.ingredientName' });
  });

  it('numero(): vazio é null, lixo é NaN, vírgula é decimal', () => {
    expect(numero('')).toBeNull();
    expect(numero(null)).toBeNull();
    expect(numero('2,5')).toBe(2.5);
    expect(numero(3)).toBe(3);
    expect(Number.isNaN(numero('abc'))).toBe(true);
  });
});

describe('rascunhoDaResposta — a IA sugere, nunca inventa', () => {
  it('campo ilegível vira null E entra em lowConfidence; campo ausente fica null sem alarde', () => {
    const r = rascunhoDaResposta({
      name: 'Pão c/ Linguiça Completo', code: null, category: 'Lanches',
      items: [
        { ingredientName: 'Linguiça', quantity: 2, unit: 'fatias', weightGrams: 'ilegível', notes: null },
        { ingredientName: 'Saco para Lanche', quantity: 1, unit: 'Unid', weightGrams: null, notes: null },
      ],
      lowConfidence: ['code'],
      photoBox: { x: 55, y: 30, w: 40, h: 50 },
    });
    expect(r.dados.code).toBe('');
    expect(r.lowConfidence).toContain('code');
    expect(r.dados.items[0].weightGrams).toBeNull();
    expect(r.lowConfidence).toContain('items.0.weightGrams');
    expect(r.dados.items[1].weightGrams).toBeNull();
    expect(r.lowConfidence).not.toContain('items.1.weightGrams');
    expect(r.photoBox).toEqual({ x: 55, y: 30, w: 40, h: 50 });
  });

  it('sem nome nem código, os dois ficam marcados para revisão; caixa da foto minúscula ou inválida é descartada', () => {
    const r = rascunhoDaResposta({ items: [], photoBox: { x: 10, y: 10, w: 2, h: 2 } });
    expect(r.lowConfidence).toEqual(expect.arrayContaining(['name', 'code']));
    expect(r.photoBox).toBeNull();
    expect(rascunhoDaResposta({ photoBox: 'na direita' }).photoBox).toBeNull();
    expect(rascunhoDaResposta('lixo').dados.items).toEqual([]);
  });

  it('item sem nome é descartado e os caminhos de lowConfidence dos seguintes são realinhados', () => {
    const r = rascunhoDaResposta({
      name: 'X', code: '1',
      items: [{ ingredientName: '' }, { ingredientName: 'Tomate', quantity: 1, weightGrams: null }],
      lowConfidence: ['items.1.weightGrams'],
    });
    expect(r.dados.items).toHaveLength(1);
    expect(r.dados.items[0].ingredientName).toBe('Tomate');
    expect(r.lowConfidence).toContain('items.0.weightGrams');
    expect(r.lowConfidence).not.toContain('items.1.weightGrams');
  });
});

describe('diferencas — o histórico na língua de quem lê', () => {
  it('"Linguiça · Peso: 120 g → 110 g" e nada mais quando só o peso mudou', () => {
    const antes = paoLinguica();
    const depois = paoLinguica();
    depois.items[1].weightGrams = 110;
    expect(diferencas(antes, depois)).toEqual([{ field: 'Linguiça · Peso', oldValue: '120 g', newValue: '110 g' }]);
  });

  it('ingrediente adicionado, removido e a troca de nome do produto', () => {
    const antes = paoLinguica();
    const depois = paoLinguica();
    depois.name = 'Pão com Linguiça Completo';
    depois.items = depois.items.filter((i) => i.ingredientName !== 'Queijo Minas');
    depois.items.push({ ingredientName: 'Maionese', quantity: 1, unit: 'colher', weightGrams: 10, notes: null });
    const m = diferencas(antes, depois);
    expect(m).toContainEqual({ field: 'Nome', oldValue: 'Pão c/ Linguiça Completo', newValue: 'Pão com Linguiça Completo' });
    expect(m).toContainEqual({ field: 'Ingrediente adicionado', oldValue: null, newValue: 'Maionese · 1 colher · 10 g' });
    expect(m).toContainEqual({ field: 'Ingrediente removido', oldValue: 'Queijo Minas · 1 fatia · 60 g', newValue: null });
  });

  it('só a ORDEM mudou: uma linha, não uma por item', () => {
    const antes = paoLinguica();
    const depois = paoLinguica();
    depois.items.reverse();
    const m = diferencas(antes, depois);
    expect(m).toHaveLength(1);
    expect(m[0].field).toBe('Ordem dos ingredientes');
  });

  it('ficha igual não gera histórico; acento/caixa no nome do ingrediente casa o mesmo item', () => {
    expect(diferencas(paoLinguica(), paoLinguica())).toEqual([]);
    const depois = paoLinguica();
    depois.items[1].ingredientName = 'LINGUICA';
    expect(diferencas(paoLinguica(), depois)).toEqual([{ field: 'Linguiça · Nome', oldValue: 'Linguiça', newValue: 'LINGUICA' }]);
  });
});

describe('buscarFichas — nome, código ou ingrediente, sem acento', () => {
  const lista = [
    { id: 'a', name: 'Pão c/ Linguiça Completo', code: '910000000501', category: 'Pão Francês', ingredientes: ['Pão Francês', 'Linguiça', 'Queijo Minas'] },
    { id: 'b', name: 'Coxinha de Frango', code: '910000000777', category: 'Salgados', ingredientes: ['Massa', 'Frango desfiado', 'Requeijão'] },
  ];
  it('"linguica" acha pelo INGREDIENTE; "requeij" acha a coxinha', () => {
    expect(buscarFichas(lista, 'linguica').map((f) => f.id)).toEqual(['a']);
    expect(buscarFichas(lista, 'REQUEIJ').map((f) => f.id)).toEqual(['b']);
  });
  it('código inteiro ou parcial; várias palavras exigem todas', () => {
    expect(buscarFichas(lista, '0777').map((f) => f.id)).toEqual(['b']);
    expect(buscarFichas(lista, 'pão linguiça').map((f) => f.id)).toEqual(['a']);
    expect(buscarFichas(lista, 'pão frango')).toEqual([]);
    expect(buscarFichas(lista, '   ')).toHaveLength(2);
  });
});

describe('textos de apresentação', () => {
  it('quantidade com unidade, peso em g com vírgula, vazio quando não há', () => {
    expect(textoQuantidade({ quantity: 2, unit: 'fatias' })).toBe('2 fatias');
    expect(textoQuantidade({ quantity: 0.5, unit: null })).toBe('0,5');
    expect(textoQuantidade({ quantity: null, unit: null })).toBe('');
    expect(textoPeso(120)).toBe('120 g');
    expect(textoPeso(12.5)).toBe('12,5 g');
    expect(textoPeso(null)).toBe('');
  });
});
