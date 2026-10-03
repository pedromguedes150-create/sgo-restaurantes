/**
 * Fundo contínuo do sistema (kit de layout, 3-componentes-sgo/AmbientBackground).
 *
 * Montado UMA única vez, no layout do app, atrás de tudo (z-index -1). É ele
 * que dá a premissa "vidro sobre fundo contínuo": as manchas de luz atravessam
 * o app inteiro e as superfícies translúcidas (.sgo-navbar, .sgo-panel) deixam
 * esse fundo transparecer. Nenhum ancestral pode criar contexto de empilhamento
 * entre ele e a raiz — por isso é filho direto do topo da árvore.
 *
 * As cores vivem em sgo-kit.css (seção 20a): a geometria é a do kit, a tinta
 * é o bordô do Restaurante. Sem estado e sem JS: Server Component.
 */
export function AmbientBackground() {
  return <div className="sgo-ambient" aria-hidden="true" data-testid="ambient-background" />;
}
