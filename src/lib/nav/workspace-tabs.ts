import type { AreaMontada } from '@/lib/nav/areas';

/**
 * ABAS DE TRABALHO (kit de layout, 2-moldura/TabsContext.tsx) — a conta, sem React.
 *
 * O kit guarda uma aba por tela aberta, com a rota e um título curto, e a
 * navegação comum ATUALIZA a aba ativa (semântica de navegador). Aqui a
 * diferença é de onde vem o título: o kit tinha um mapa fixo de ~89 rotas; o
 * Restaurante deriva do CATÁLOGO de menu (`areas.ts`), casando pelo caminho
 * mais longo — tela nova no menu já nasce com título na aba.
 *
 * Sem keep-alive: o App Router desmonta a página ao trocar de rota, então a
 * aba guarda a ROTA, não a árvore montada (divergência registrada do kit).
 */
export interface AbaDeTrabalho {
  id: string;
  /** Caminho + query, como o kit. */
  route: string;
  title: string;
  fullTitle?: string;
}

export interface EstadoDasAbas { tabs: AbaDeTrabalho[]; activeTabId: string | null }

export const MAX_ABAS = 14;
export const STORAGE_KEY = 'sgo-workspace-tabs';
export const ROTA_PADRAO = '/dashboard';

/** Telas que não viram aba (públicas, aceite de termo, links sem login). */
const EXCLUIDAS = ['/login', '/termo', '/pizzas/', '/higiene/', '/ficha/'];
export function ehExcluida(route: string): boolean {
  const caminho = route.split('?')[0];
  return EXCLUIDAS.some((p) => caminho === p.replace(/\/$/, '') || caminho.startsWith(p));
}

const TITULOS_FIXOS: Record<string, [string, string]> = {
  '/dashboard': ['Início', 'Início / Painel'],
  '/modulos': ['Módulos', 'Início / Módulos'],
  '/notificacoes': ['Notificações', 'Início / Notificações'],
  '/perfil': ['Meu Perfil', 'Início / Meu Perfil'],
  '/ajuda': ['Ajuda', 'Início / Treinamento da Plataforma'],
};

/** "Hora extra (painel e fechamento)" → "Hora extra": o chip é curto; o rótulo inteiro fica no tooltip. */
const semParenteses = (s: string) => s.replace(/\s*\([^)]*\)\s*$/u, '').trim() || s;
const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** Título curto (chip) e completo (tooltip) de uma rota, pelo catálogo do menu. */
export function tituloDaRota(route: string, areas: AreaMontada[]): { title: string; fullTitle: string } {
  const caminho = route.split('?')[0] || '/';
  const fixo = TITULOS_FIXOS[caminho];
  if (fixo) return { title: fixo[0], fullTitle: fixo[1] };

  let melhor: { area: string; label: string; tamanho: number } | null = null;
  for (const a of areas) {
    for (const c of a.colunas) {
      for (const i of c.itens) {
        if (caminho !== i.href && !caminho.startsWith(i.href + '/')) continue;
        if (!melhor || i.href.length > melhor.tamanho) melhor = { area: a.titulo, label: i.label, tamanho: i.href.length };
      }
    }
  }
  /* O chip é curto: "Hora extra (painel e fechamento)" vira "Hora extra"; o
     rótulo inteiro fica no tooltip (fullTitle), como no kit. */
  if (melhor) return { title: semParenteses(melhor.label), fullTitle: `${melhor.area} / ${melhor.label}` };

  const ultimo = caminho.split('/').filter(Boolean).pop() ?? 'Início';
  const titulo = /^[a-z0-9]{20,}$/i.test(ultimo) ? 'Detalhe' : titleCase(ultimo);
  return { title: titulo, fullTitle: titulo };
}

/** Chave de ícone da área dona da rota (resolvida para o componente na tela). */
export function iconeDaRota(route: string, areas: AreaMontada[]): string | null {
  const caminho = route.split('?')[0];
  let melhor: { icone: string; tamanho: number } | null = null;
  for (const a of areas) {
    for (const c of a.colunas) {
      for (const i of c.itens) {
        if (caminho !== i.href && !caminho.startsWith(i.href + '/')) continue;
        if (!melhor || i.href.length > melhor.tamanho) melhor = { icone: a.icone, tamanho: i.href.length };
      }
    }
  }
  return melhor?.icone ?? null;
}

export function novoId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* sem contexto seguro: cai no fallback */ }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Lê o que ficou no armazenamento, validando a forma (lixo vira `null`). */
export function lerArmazenadas(raw: string | null): EstadoDasAbas | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { tabs?: unknown; activeTabId?: unknown };
    if (!Array.isArray(p.tabs)) return null;
    const tabs = p.tabs
      .filter((t): t is AbaDeTrabalho => !!t && typeof t === 'object' && typeof (t as AbaDeTrabalho).route === 'string' && typeof (t as AbaDeTrabalho).id === 'string')
      .filter((t) => !ehExcluida(t.route))
      .slice(0, MAX_ABAS);
    if (tabs.length === 0) return null;
    const activeTabId = typeof p.activeTabId === 'string' && tabs.some((t) => t.id === p.activeTabId) ? p.activeTabId : tabs[0].id;
    return { tabs, activeTabId };
  } catch {
    return null;
  }
}

/** Reaplica títulos pelo catálogo (o rótulo pode ter mudado desde que a aba foi gravada). */
export function retitular(estado: EstadoDasAbas, areas: AreaMontada[]): EstadoDasAbas {
  return { ...estado, tabs: estado.tabs.map((t) => ({ ...t, ...tituloDaRota(t.route, areas) })) };
}

export function estadoInicial(rotaAtual: string, areas: AreaMontada[]): EstadoDasAbas {
  const route = ehExcluida(rotaAtual) ? ROTA_PADRAO : rotaAtual;
  const id = novoId();
  return { tabs: [{ id, route, ...tituloDaRota(route, areas) }], activeTabId: id };
}

/** Navegação comum: a aba ATIVA passa a apontar para a rota nova (sem criar aba). */
export function navegou(estado: EstadoDasAbas, rota: string, areas: AreaMontada[]): EstadoDasAbas {
  if (ehExcluida(rota)) return estado;
  if (!estado.activeTabId) return estadoInicial(rota, areas);
  return {
    ...estado,
    tabs: estado.tabs.map((t) => (t.id === estado.activeTabId ? { ...t, route: rota, ...tituloDaRota(rota, areas) } : t)),
  };
}

export function abrir(estado: EstadoDasAbas, rota: string, areas: AreaMontada[]): EstadoDasAbas {
  const route = ehExcluida(rota) ? ROTA_PADRAO : rota;
  const nova: AbaDeTrabalho = { id: novoId(), route, ...tituloDaRota(route, areas) };
  const tabs = [...estado.tabs, nova];
  /* Acima do teto a mais ANTIGA sai, como no kit. */
  return { tabs: tabs.length > MAX_ABAS ? tabs.slice(1) : tabs, activeTabId: nova.id };
}

export function ativar(estado: EstadoDasAbas, id: string): EstadoDasAbas {
  return estado.tabs.some((t) => t.id === id) ? { ...estado, activeTabId: id } : estado;
}

/** Fechar a ativa passa para a vizinha (mesmo índice ou a última). A última aba não fecha. */
export function fechar(estado: EstadoDasAbas, id: string): EstadoDasAbas {
  if (estado.tabs.length <= 1) return estado;
  const idx = estado.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return estado;
  const tabs = estado.tabs.filter((t) => t.id !== id);
  const activeTabId = estado.activeTabId === id ? tabs[Math.min(idx, tabs.length - 1)].id : estado.activeTabId;
  return { tabs, activeTabId };
}

export function vizinha(estado: EstadoDasAbas, passo: 1 | -1): string | null {
  if (estado.tabs.length === 0) return null;
  const idx = Math.max(0, estado.tabs.findIndex((t) => t.id === estado.activeTabId));
  return estado.tabs[(idx + passo + estado.tabs.length) % estado.tabs.length].id;
}
