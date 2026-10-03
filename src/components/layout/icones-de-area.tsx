import { BarChart3, FileText, Home, LayoutGrid, ListChecks, Settings, Users } from 'lucide-react';

/**
 * Chave do catálogo de menu (`areas.ts`, que é puro e não carrega JSX) →
 * componente de ícone. Um mapa só, usado pela barra, pelo menu móvel, pelo hub
 * e pelas abas de trabalho — para a mesma área ter o mesmo desenho em todos.
 */
export const ICONES_DE_AREA: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home, checks: ListChecks, grid: LayoutGrid, users: Users, chart: BarChart3, file: FileText, settings: Settings,
};
