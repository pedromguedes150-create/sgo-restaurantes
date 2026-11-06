import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FOTOS_GERAIS, MAX_FOTOS_CHECKLIST, TOLERANCIA_FOTO_RECENTE_MS, fotoTiradaAgora, itensSemFoto, itensTravados, limiteDeFotos, mensagemFotoObrigatoria,
} from '@/lib/tasks/foto-obrigatoria';

/** FOTO OBRIGATÓRIA NO ITEM (v1.191.0) — as regras, sem banco. */
const itens = [
  { id: 'a', requiresPhoto: false, text: 'Ligar as luzes' },
  { id: 'b', requiresPhoto: true, text: 'Vitrine montada' },
  { id: 'c', requiresPhoto: false, text: 'Conferir caixa' },
  { id: 'd', requiresPhoto: true, text: 'Banheiro limpo' },
  { id: 'e', requiresPhoto: false, text: 'Fechar' },
];

describe('quem exige foto e ainda não tem', () => {
  it('lista os itens "Exige foto" sem foto LIGADA a eles, na ordem; foto geral (sem item) não conta', () => {
    expect(itensSemFoto(itens, []).map((i) => i.id)).toEqual(['b', 'd']);
    expect(itensSemFoto(itens, [{ itemId: null }]).map((i) => i.id)).toEqual(['b', 'd']);
    expect(itensSemFoto(itens, [{ itemId: 'b' }]).map((i) => i.id)).toEqual(['d']);
    expect(itensSemFoto(itens, [{ itemId: 'b' }, { itemId: 'd' }])).toEqual([]);
    expect(itensSemFoto(itens, [{ itemId: 'a' }]).map((i) => i.id)).toEqual(['b', 'd']); // foto no item errado não vale
  });
  it('os itens DEPOIS do primeiro pendente ficam travados — "só vai para o próximo depois da foto"', () => {
    expect([...itensTravados(itens, [])]).toEqual(['c', 'd', 'e']);
    expect([...itensTravados(itens, [{ itemId: 'b' }])]).toEqual(['e']);
    expect(itensTravados(itens, [{ itemId: 'b' }, { itemId: 'd' }]).size).toBe(0);
    expect(itensTravados([{ id: 'x', requiresPhoto: false }], []).size).toBe(0);
  });
  it('o alerta nomeia o item', () => {
    expect(mensagemFotoObrigatoria(itens[1])).toContain('"Vitrine montada"');
    expect(mensagemFotoObrigatoria({})).toContain('"anterior"');
  });
});

describe('teto de fotos', () => {
  it('5 gerais + uma por item exigido, com teto absoluto', () => {
    expect(FOTOS_GERAIS).toBe(5);
    expect(limiteDeFotos(itens)).toBe(7);
    expect(limiteDeFotos([])).toBe(5);
    expect(limiteDeFotos(Array.from({ length: 40 }, (_, i) => ({ id: String(i), requiresPhoto: true })))).toBe(MAX_FOTOS_CHECKLIST);
  });
});

describe('a foto foi tirada AGORA (câmera), não escolhida na galeria', () => {
  const agora = Date.parse('2026-11-06T15:00:00Z');
  it('aceita arquivo recente, recusa o antigo; sem data não julga', () => {
    expect(fotoTiradaAgora(agora - 5_000, agora)).toBe(true);
    expect(fotoTiradaAgora(agora - TOLERANCIA_FOTO_RECENTE_MS, agora)).toBe(true);
    expect(fotoTiradaAgora(agora - TOLERANCIA_FOTO_RECENTE_MS - 1, agora)).toBe(false);
    expect(fotoTiradaAgora(agora - 3 * 24 * 3600_000, agora)).toBe(false);
    expect(fotoTiradaAgora(agora + 60_000, agora)).toBe(true); // relógio um pouco adiantado
    expect(fotoTiradaAgora(agora + 3600_000, agora)).toBe(false);
    expect(fotoTiradaAgora(0, agora)).toBe(true);
    expect(fotoTiradaAgora(undefined, agora)).toBe(true);
    expect(fotoTiradaAgora(Number.NaN, agora)).toBe(true);
  });
});

describe('a tela: só a câmera', () => {
  it('todo campo de foto do checklist abre a câmera (capture) e nenhum aceita vários de uma vez (galeria)', () => {
    const src = readFileSync('src/components/tasks/checklist-runner.tsx', 'utf8');
    const inputs = src.match(/<input[^>]*type="file"[^>]*>/g) ?? [];
    expect(inputs.length).toBeGreaterThanOrEqual(4);
    for (const i of inputs) {
      expect(i, i).toContain('capture="environment"');
      expect(i, i).toContain('accept="image/*"');
      expect(i, i).not.toContain('multiple');
    }
    expect(src).toContain('fotoTiradaAgora(');
    expect(src).toContain('itensTravados(');
  });
});
