import { describe, it, expect } from 'vitest';
import {
  normalizarDados, rascunhoDaResposta, diferencas, buscarFichas, textoRapido, ehPdf, capaDaFicha,
  segmentoDaAba, abaDoSegmento, normalizarSegmento, type DadosDaFicha,
} from '@/lib/preparo/tipos';

/**
 * PADRONIZAÇÃO — aba RESTAURANTE (v1.172.0), o núcleo puro. O guia cobre um
 * GRUPO de preparações: sem código, com função/temperatura/tempo, e as
 * preparações vivem em `items` só pelo nome. A lanchonete não muda.
 */

const guia = (): DadosDaFicha => ({
  name: 'Cubas Prontas', code: '', category: 'Padronização de preparações',
  preparationMethod: null, generalNotes: 'Aquecer o forno antes.',
  segment: 'RESTAURANTE', ovenMode: 'Ar Seco', temperature: '200°C', cookTime: '15 Min',
  items: [
    { ingredientName: 'Escondidinho', quantity: null, unit: null, weightGrams: null, notes: null },
    { ingredientName: 'Lasanha', quantity: null, unit: null, weightGrams: null, notes: null },
  ],
});

describe('normalizarDados por aba', () => {
  it('RESTAURANTE: sem código é válido; função/temperatura/tempo e as preparações entram', () => {
    const r = normalizarDados({ name: ' Cubas Prontas ', code: '', category: 'Padronização', segment: 'RESTAURANTE', ovenMode: ' Ar Seco ', temperature: '200°C', cookTime: '15 Min',
      items: [{ ingredientName: 'Escondidinho' }, { ingredientName: 'Lasanha' }, { ingredientName: '' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toMatchObject({ name: 'Cubas Prontas', code: '', segment: 'RESTAURANTE', ovenMode: 'Ar Seco', temperature: '200°C', cookTime: '15 Min' });
    expect(r.dados.items.map((i) => i.ingredientName)).toEqual(['Escondidinho', 'Lasanha']);
  });

  it('LANCHONETE continua exigindo código — e ignora os campos do forno mesmo que venham', () => {
    expect(normalizarDados({ name: 'X', code: '', segment: 'LANCHONETE', items: [] })).toMatchObject({ ok: false, motivo: 'SEM_CODIGO' });
    const r = normalizarDados({ name: 'X', code: '1', items: [], ovenMode: 'Ar Seco', temperature: '200°C' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.segment).toBe('LANCHONETE');
    expect(r.dados.ovenMode).toBeNull();
    expect(r.dados.temperature).toBeNull();
  });

  it('segmento desconhecido cai em LANCHONETE (o padrão de toda ficha existente)', () => {
    expect(normalizarSegmento('QUALQUER')).toBe('LANCHONETE');
    expect(normalizarSegmento(undefined)).toBe('LANCHONETE');
    expect(normalizarSegmento('RESTAURANTE')).toBe('RESTAURANTE');
  });

  it('campo rápido longo demais é recusado', () => {
    expect(normalizarDados({ name: 'X', segment: 'RESTAURANTE', ovenMode: 'a'.repeat(41), items: [] })).toMatchObject({ ok: false, motivo: 'MUITO_LONGO' });
  });
});

describe('rascunhoDaResposta do guia — a IA sugere, nunca inventa', () => {
  it('sem código não marca revisão (o guia não tem código); temperatura ausente fica null E marcada; a caixa da foto não se aplica', () => {
    const r = rascunhoDaResposta({ name: 'Cubas Prontas', ovenMode: 'Ar Seco', cookTime: '15 Min', items: [{ ingredientName: 'Lasanha' }], photoBox: { x: 0, y: 0, w: 0.5, h: 0.5 }, lowConfidence: [] }, 'RESTAURANTE');
    expect(r.dados).toMatchObject({ code: '', segment: 'RESTAURANTE', ovenMode: 'Ar Seco', temperature: null, cookTime: '15 Min' });
    expect(r.lowConfidence).toContain('temperature');
    expect(r.lowConfidence).not.toContain('code');
    expect(r.photoBox).toBeNull();
    expect(r.dados.items.map((i) => i.ingredientName)).toEqual(['Lasanha']);
  });

  it('na LANCHONETE nada disso muda: código ausente segue marcado e os campos do forno não existem', () => {
    const r = rascunhoDaResposta({ name: 'Pão', items: [] });
    expect(r.lowConfidence).toContain('code');
    expect(r.dados.ovenMode).toBeNull();
    expect(r.dados.segment).toBe('LANCHONETE');
  });
});

describe('textos e capa do guia', () => {
  it('textoRapido junta só o que existe: "Ar Seco · 200°C · 15 Min"', () => {
    expect(textoRapido(guia())).toBe('Ar Seco · 200°C · 15 Min');
    expect(textoRapido({ ovenMode: null, temperature: ' 180°C ', cookTime: null })).toBe('180°C');
    expect(textoRapido({ ovenMode: null, temperature: null, cookTime: null })).toBe('');
  });

  it('ehPdf e capaDaFicha: foto própria vence; arquivo-fonte imagem serve de capa; PDF não é capa', () => {
    expect(ehPdf('uploads/preparo/fonte-1.PDF')).toBe(true);
    expect(ehPdf('uploads/preparo/fonte-1.jpg')).toBe(false);
    expect(ehPdf(null)).toBe(false);
    expect(capaDaFicha({ imagePath: 'uploads/preparo/foto.jpg', sourceFilePath: 'uploads/preparo/fonte.pdf' })).toBe('uploads/preparo/foto.jpg');
    expect(capaDaFicha({ imagePath: null, sourceFilePath: 'uploads/preparo/fonte.jpg' })).toBe('uploads/preparo/fonte.jpg');
    expect(capaDaFicha({ imagePath: null, sourceFilePath: 'uploads/preparo/fonte.pdf' })).toBeNull();
  });

  it('aba ↔ segmento: só "restaurante" leva ao RESTAURANTE; o resto é LANCHONETE', () => {
    expect(segmentoDaAba('restaurante')).toBe('RESTAURANTE');
    expect(segmentoDaAba('lanchonete')).toBe('LANCHONETE');
    expect(segmentoDaAba(undefined)).toBe('LANCHONETE');
    expect(abaDoSegmento('RESTAURANTE')).toBe('restaurante');
    expect(abaDoSegmento('LANCHONETE')).toBe('lanchonete');
  });
});

describe('histórico e busca do guia', () => {
  it('diferencas fala de Função/Temperatura/Tempo', () => {
    const antes = guia();
    const depois = { ...guia(), temperature: '180°C', cookTime: null };
    expect(diferencas(antes, depois)).toEqual(expect.arrayContaining([
      { field: 'Temperatura', oldValue: '200°C', newValue: '180°C' },
      { field: 'Tempo', oldValue: '15 Min', newValue: null },
    ]));
    expect(diferencas(guia(), guia())).toEqual([]);
  });

  it('buscarFichas acha o guia pela PREPARAÇÃO ("lasanha") — é o mesmo campo dos ingredientes', () => {
    const lista = [{ name: 'Cubas Prontas', code: '', category: 'Padronização', ingredientes: ['Escondidinho', 'Lasanha'] }, { name: 'Gratinados', code: '', category: 'Padronização', ingredientes: ['Batata gratinada'] }];
    expect(buscarFichas(lista, 'lasanha').map((f) => f.name)).toEqual(['Cubas Prontas']);
    expect(buscarFichas(lista, 'gratin').map((f) => f.name)).toEqual(['Gratinados']);
  });
});
