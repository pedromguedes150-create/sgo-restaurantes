import { describe, it, expect } from 'vitest';
import { PUSH_CATEGORIES, categoryOfModule, deviceLabelFromUserAgent } from '@/lib/push/categories';

describe('categoryOfModule — módulo de notificação → categoria de push', () => {
  it('agrupa os módulos operacionais em OPERACAO', () => {
    for (const m of ['WASTE', 'COMMANDS', 'GAS', 'OIL', 'CASH', 'NOTES', 'INVENTORY']) {
      expect(categoryOfModule(m)).toBe('OPERACAO');
    }
  });

  it('mantém comunicados e ocorrências separados (o gerente desliga um sem perder o outro)', () => {
    expect(categoryOfModule('COMMUNICATION')).toBe('COMUNICADOS');
    expect(categoryOfModule('OCCURRENCES')).toBe('OCORRENCIAS');
    expect(categoryOfModule('MAINTENANCE')).toBe('OCORRENCIAS');
  });

  it('checklists/metas/treinamentos caem em TAREFAS', () => {
    expect(categoryOfModule('CHECKLISTS')).toBe('TAREFAS');
    expect(categoryOfModule('META')).toBe('TAREFAS');
    expect(categoryOfModule('TRAINING')).toBe('TAREFAS');
  });

  it('módulo desconhecido, vazio ou nulo vira GERAL (nunca perde o aviso)', () => {
    expect(categoryOfModule('MODULO_QUE_NAO_EXISTE')).toBe('GERAL');
    expect(categoryOfModule(undefined)).toBe('GERAL');
    expect(categoryOfModule(null)).toBe('GERAL');
    expect(categoryOfModule('')).toBe('GERAL');
  });

  it('é insensível a maiúsculas/minúsculas', () => {
    expect(categoryOfModule('people')).toBe('PESSOAS');
  });

  it('toda categoria devolvida existe na lista mostrada ao usuário', () => {
    const keys = new Set(PUSH_CATEGORIES.map((c) => c.key));
    for (const m of ['TASKS', 'COMMUNICATION', 'OCCURRENCES', 'WASTE', 'PEOPLE', 'XPTO']) {
      expect(keys.has(categoryOfModule(m))).toBe(true);
    }
  });
});

describe('deviceLabelFromUserAgent — rótulo do aparelho', () => {
  it('identifica Android + Chrome', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    expect(deviceLabelFromUserAgent(ua)).toBe('Android · Chrome');
  });

  it('identifica iPhone + Safari', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(deviceLabelFromUserAgent(ua)).toBe('iPhone/iPad · Safari');
  });

  it('Edge no Windows não é confundido com Chrome', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0';
    expect(deviceLabelFromUserAgent(ua)).toBe('Windows · Edge');
  });

  it('sem user-agent devolve rótulo genérico', () => {
    expect(deviceLabelFromUserAgent(null)).toBe('Aparelho');
    expect(deviceLabelFromUserAgent('')).toBe('Aparelho');
  });
});
