'use client';

/**
 * template.tsx re-monta a cada navegação (diferente de layout.tsx, persistente),
 * então a animação de ENTRADA replay a cada troca de rota. Crossfade + leve
 * deslize (200ms), desligado por prefers-reduced-motion via CSS. A paralaxe da
 * página que sai exige AnimatePresence (lib externa) — fora do escopo.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="sgo-page-enter">{children}</div>;
}
