import { describe, it, expect } from 'vitest';
import { badgesPorArea } from '@/lib/nav/pendencias-puro';
import { tempoRelativo } from '@/lib/nav/tempo-relativo';
import type { AreaMontada } from '@/lib/nav/areas';

/**
 * SELOS DA BARRA — a soma por área é pura: a chave é a do MÓDULO e a área soma
 * o que contém, pelo mesmo catálogo que monta o menu.
 */
const AREAS: AreaMontada[] = [
  { id: 'inicio', titulo: 'Início', icone: 'home', href: '/dashboard', colunas: [{ titulo: 'Comunicação', itens: [{ key: 'COMMUNICATION', label: 'Comunicação', href: '/modulos/comunicacao' }] }] },
  { id: 'pessoas', titulo: 'Pessoas', icone: 'users', href: '/modulos/pessoas', colunas: [{ titulo: 'Pagamentos', itens: [{ key: 'PAYMENTS', label: 'Pagamentos', href: '/modulos/pagamentos' }, { key: 'HORA_EXTRA', label: 'Hora extra', href: '/modulos/hora-extra' }] }] },
  { id: 'operacao', titulo: 'Operação', icone: 'grid', href: '/modulos/ocorrencias', colunas: [{ titulo: 'Controles', itens: [{ key: 'OCCURRENCES', label: 'Ocorrências', href: '/modulos/ocorrencias' }] }] },
];

describe('badgesPorArea', () => {
  it('soma os módulos de cada área e omite área sem pendência', () => {
    expect(badgesPorArea(AREAS, { PAYMENTS: 3, COMMUNICATION: 2, HORA_EXTRA: 1 })).toEqual({ inicio: 2, pessoas: 4 });
    expect(badgesPorArea(AREAS, {})).toEqual({});
    /* Módulo que o perfil não vê (fora do catálogo montado) não pesa em lugar nenhum. */
    expect(badgesPorArea(AREAS, { TASKS: 9 })).toEqual({});
  });
});

describe('tempoRelativo', () => {
  const agora = new Date('2026-10-03T12:00:00Z');
  it('fala em português e arredonda pela unidade mais próxima', () => {
    expect(tempoRelativo('2026-10-03T11:59:40Z', agora)).toBe('agora');
    expect(tempoRelativo('2026-10-03T11:55:00Z', agora)).toBe('há 5 minutos');
    expect(tempoRelativo('2026-10-03T11:59:00Z', agora)).toBe('há 1 minuto');
    expect(tempoRelativo('2026-10-03T09:00:00Z', agora)).toBe('há 3 horas');
    expect(tempoRelativo('2026-10-01T12:00:00Z', agora)).toBe('há 2 dias');
    expect(tempoRelativo('2026-07-03T12:00:00Z', agora)).toBe('há 3 meses');
    expect(tempoRelativo('2024-10-03T12:00:00Z', agora)).toBe('há 2 anos');
    expect(tempoRelativo('lixo', agora)).toBe('');
  });
});
