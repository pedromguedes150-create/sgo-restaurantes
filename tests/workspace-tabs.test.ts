import { describe, it, expect } from 'vitest';
import {
  MAX_ABAS, abrir, ativar, ehExcluida, estadoInicial, fechar, iconeDaRota, lerArmazenadas, navegou, tituloDaRota, vizinha,
} from '@/lib/nav/workspace-tabs';
import type { AreaMontada } from '@/lib/nav/areas';

/**
 * ABAS DE TRABALHO — a conta, sem React.
 *
 * O título sai do CATÁLOGO de menu (não de um mapa fixo como no kit): tela
 * nova no menu já nasce com título na aba. A semântica é a de navegador:
 * navegar troca a rota da aba ATIVA; abrir cria; a última não fecha.
 */
const AREAS: AreaMontada[] = [
  { id: 'inicio', titulo: 'Início', icone: 'home', href: '/dashboard', colunas: [{ titulo: 'Meu painel', itens: [{ key: 'DASHBOARD', label: 'Dashboard', href: '/dashboard' }] }] },
  {
    id: 'pessoas', titulo: 'Pessoas', icone: 'users', href: '/modulos/pessoas',
    colunas: [{ titulo: 'Pagamentos', itens: [
      { key: 'PAYMENTS', label: 'Pagamentos', href: '/modulos/pagamentos' },
      { key: 'HORA_EXTRA', label: 'Hora extra', href: '/modulos/hora-extra' },
    ] }],
  },
];

describe('título pelo catálogo', () => {
  it('casa pelo caminho MAIS LONGO e monta "Área / Tela"', () => {
    expect(tituloDaRota('/modulos/hora-extra?aba=fechamento', AREAS)).toEqual({ title: 'Hora extra', fullTitle: 'Pessoas / Hora extra' });
    expect(tituloDaRota('/modulos/pagamentos/consolidacao', AREAS).title).toBe('Pagamentos');
    expect(tituloDaRota('/dashboard', AREAS).title).toBe('Início');
  });

  it('o chip perde o parêntese explicativo do rótulo; o tooltip guarda o rótulo inteiro', () => {
    const areas: AreaMontada[] = [{ id: 'p', titulo: 'Pessoas', icone: 'users', href: '/x', colunas: [{ titulo: 'Pagamentos', itens: [{ key: 'K', label: 'Hora extra (painel e fechamento)', href: '/modulos/hora-extra' }] }] }];
    expect(tituloDaRota('/modulos/hora-extra', areas)).toEqual({ title: 'Hora extra', fullTitle: 'Pessoas / Hora extra (painel e fechamento)' });
  });

  it('rota fora do catálogo: último segmento em Title Case; id de registro vira "Detalhe"', () => {
    expect(tituloDaRota('/modulos/ocorrencias/relatorio-mensal', AREAS).title).toBe('Relatorio Mensal');
    expect(tituloDaRota('/modulos/ocorrencias/cmuqz8c4v000o1udbkwgndsid', AREAS).title).toBe('Detalhe');
    expect(iconeDaRota('/modulos/hora-extra', AREAS)).toBe('users');
    expect(iconeDaRota('/nada', AREAS)).toBeNull();
  });

  it('telas públicas e o aceite de termo não viram aba', () => {
    expect(ehExcluida('/login')).toBe(true);
    expect(ehExcluida('/pizzas/abc123')).toBe(true);
    expect(ehExcluida('/modulos/pizzas')).toBe(false);
  });
});

describe('semântica de navegador', () => {
  it('navegar atualiza a aba ativa; abrir cria e ativa; o teto descarta a mais antiga', () => {
    let e = estadoInicial('/dashboard', AREAS);
    expect(e.tabs).toHaveLength(1);
    e = navegou(e, '/modulos/hora-extra', AREAS);
    expect(e.tabs).toHaveLength(1);
    expect(e.tabs[0]).toMatchObject({ route: '/modulos/hora-extra', title: 'Hora extra' });
    e = abrir(e, '/modulos/pagamentos', AREAS);
    expect(e.tabs).toHaveLength(2);
    expect(e.tabs[1].id).toBe(e.activeTabId);
    for (let i = 0; i < MAX_ABAS; i++) e = abrir(e, '/dashboard', AREAS);
    expect(e.tabs).toHaveLength(MAX_ABAS);
    expect(e.tabs[0].route).not.toBe('/modulos/hora-extra'); // a mais antiga saiu
  });

  it('fechar a ativa passa para a vizinha; a última aba não fecha; vizinha dá a volta', () => {
    let e = estadoInicial('/dashboard', AREAS);
    e = abrir(e, '/modulos/pagamentos', AREAS);
    e = abrir(e, '/modulos/hora-extra', AREAS);
    const [a, b, c] = e.tabs.map((t) => t.id);
    expect(e.activeTabId).toBe(c);
    e = fechar(e, c);
    expect(e.activeTabId).toBe(b);
    e = ativar(e, a);
    expect(vizinha(e, -1)).toBe(b); // volta pelo fim
    expect(vizinha(e, 1)).toBe(b);
    e = fechar(e, b);
    expect(fechar(e, a)).toBe(e); // última não fecha
    expect(ativar(e, 'inexistente')).toBe(e);
  });

  it('o armazenamento é validado: lixo vira null, rota excluída é descartada, ativa inválida cai na primeira', () => {
    expect(lerArmazenadas(null)).toBeNull();
    expect(lerArmazenadas('{"tabs":"x"}')).toBeNull();
    expect(lerArmazenadas('nao-json')).toBeNull();
    const ok = lerArmazenadas(JSON.stringify({ tabs: [{ id: 'a', route: '/login', title: 'x' }, { id: 'b', route: '/dashboard', title: 'Início' }], activeTabId: 'zzz' }));
    expect(ok).toEqual({ tabs: [{ id: 'b', route: '/dashboard', title: 'Início' }], activeTabId: 'b' });
  });
});
