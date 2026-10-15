/**
 * META POR MÓDULO (v1.170.0) — a aba que lista TODOS os módulos do sistema e
 * diz, para cada um, o que a meta consegue medir nele.
 *
 * Regra deste arquivo: nenhum import. A página passa o catálogo (`MODULES`) e
 * as áreas do menu (`AREAS`); aqui só se cruza.
 *
 * Decisão de desenho: o campo de peso só é EDITÁVEL onde existe um INDICADOR
 * implementado. Um peso gravado para um módulo que ninguém mede não mudaria a
 * nota de ninguém — e um número que não faz nada numa tela de bonificação é
 * pior do que um traço com explicação. O módulo sem indicador aparece na lista
 * mesmo assim: a lista é o inventário do que a diretoria pode cobrar, e
 * "ainda sem indicador" é informação.
 *
 * Os indicadores que já existiam (Treinamentos, Comunicados, Desperdício,
 * Comandas, Avaliações, Fora do prazo) continuam lendo as MESMAS chaves de
 * configuração — esta aba é outra forma de ver a mesma coisa, não uma segunda
 * conta.
 */

export type TipoDeIndicador =
  /** Peso na composição: Σ(peso × %) ÷ Σ(peso). */
  | 'PESO'
  /** Desconto direto na nota final, por ocorrência (como "fora do prazo"). */
  | 'DESCONTO'
  /** Peso definido um a um (checklists). */
  | 'POR_ITEM';

export interface IndicadorDeModulo {
  /** Entidade do dispatch de `/api/admin` (o que a tela grava). */
  entity: string;
  tipo: TipoDeIndicador;
  /** O que é medido — a frase que a diretoria lê. */
  indicador: string;
  /** Como entra na conta. */
  como: string;
  /** Mesmo ajuste vale para outros módulos (ex.: fora do prazo = 4 módulos). */
  compartilhadoCom?: string[];
}

/** Módulo → indicador. Para pôr um módulo novo na meta: medir + registrar aqui. */
export const INDICADORES: Record<string, IndicadorDeModulo> = {
  TASKS: {
    entity: '', tipo: 'POR_ITEM',
    indicador: 'Checklists do dia realizados no prazo',
    como: 'Peso individual por checklist em Configurações → Checklists ("entra na meta" + peso).',
  },
  WASTE: {
    entity: 'wasteMeta', tipo: 'PESO',
    indicador: 'Cobertura do lançamento diário de desperdício',
    como: 'Dias com lançamento ÷ dias decorridos do mês.',
  },
  COMMANDS: {
    entity: 'commandsMeta', tipo: 'PESO',
    indicador: 'Cobertura da conferência diária de comandas',
    como: 'Dias com conferência ÷ dias decorridos do mês.',
  },
  COMMUNICATION: {
    entity: 'communication', tipo: 'PESO',
    indicador: 'Comunicados confirmados no prazo',
    como: 'Confirmação de leitura no prazo pontua; vencido penaliza.',
  },
  TRAINING: {
    entity: 'training', tipo: 'PESO',
    indicador: 'Treinamentos da equipe concluídos no prazo',
    como: 'Concluídos ÷ (concluídos + vencidos) no mês.',
  },
  PEOPLE_EVALUATION: {
    entity: 'evaluation', tipo: 'PESO',
    indicador: 'Avaliação mensal dos colaboradores feita',
    como: 'Mês fechado sem avaliação penaliza.',
  },
  MANAGER_SCHEDULE: {
    entity: 'managerLeaveMeta', tipo: 'DESCONTO',
    indicador: 'Gerente com as folgas do mês cadastradas',
    como: 'Cada gerente/coordenador da unidade SEM folga nem férias lançada no mês desconta X% da nota. Dois sem folga = 2 × X%.',
  },
  NOTES: {
    entity: 'lateEntry', tipo: 'DESCONTO',
    indicador: 'Lançamento no prazo (sem correção da supervisão)',
    como: 'Cada data corrigida ou nota lançada pela supervisão desconta X% da nota.',
    compartilhadoCom: ['PAYMENTS', 'GAS', 'OIL'],
  },
  PAYMENTS: {
    entity: 'lateEntry', tipo: 'DESCONTO',
    indicador: 'Lançamento no prazo (sem correção da supervisão)',
    como: 'Cada data corrigida pela supervisão desconta X% da nota.',
    compartilhadoCom: ['NOTES', 'GAS', 'OIL'],
  },
  GAS: {
    entity: 'lateEntry', tipo: 'DESCONTO',
    indicador: 'Lançamento no prazo (sem correção da supervisão)',
    como: 'Cada data corrigida pela supervisão desconta X% da nota.',
    compartilhadoCom: ['NOTES', 'PAYMENTS', 'OIL'],
  },
  OIL: {
    entity: 'lateEntry', tipo: 'DESCONTO',
    indicador: 'Lançamento no prazo (sem correção da supervisão)',
    como: 'Cada data corrigida pela supervisão desconta X% da nota.',
    compartilhadoCom: ['NOTES', 'PAYMENTS', 'GAS'],
  },
};

/** Áreas do menu que não são módulos de operação — ficam fora da lista. */
export const AREAS_FORA_DA_META = new Set(['administrativo', 'relatorios']);
/** Telas que não são "módulo" para a meta: painéis de entrada, ajuda, consultas
    e as próprias telas da Meta — medir o painel que mede seria circular. */
export const MODULOS_FORA_DA_META = new Set([
  'DASHBOARD', 'HELP', 'MANAGER_AREA', 'EXECUTIVE', 'METAS', 'UNIT_PANEL', 'LEAVES_TEAM',
  'MANAGER_SCHEDULE_OWN', 'MANAGER_SCHEDULE_TODAY', 'MANAGER_SCHEDULE_NETWORK_REPORT',
]);

export interface ModuloCatalogado { key: string; label: string; nav?: string; parent?: string }
export interface AreaCatalogada { id: string; titulo: string; colunas: { titulo: string; keys: string[] }[] }

export interface LinhaPorModulo {
  key: string;
  label: string;
  area: string;
  indicador: IndicadorDeModulo | null;
  /** Valor atual (peso ou %); nulo quando não há indicador. */
  valor: number | null;
  /** Rótulos dos módulos que compartilham o mesmo ajuste. */
  compartilhadoCom: string[];
}
export interface GrupoPorModulo { area: string; linhas: LinhaPorModulo[] }

/**
 * Monta a lista: um grupo por área do menu, uma linha por módulo de PRIMEIRO
 * nível (sem parent) — mais as partes internas que têm indicador próprio
 * (Avaliação do colaborador, Escala de gerentes), senão elas sumiriam atrás do
 * pai "Pessoas".
 */
export function linhasPorModulo(
  modules: ModuloCatalogado[],
  areas: AreaCatalogada[],
  valores: Record<string, number>,
): GrupoPorModulo[] {
  const porKey = new Map(modules.map((m) => [m.key, m]));
  const rotulo = (k: string) => porKey.get(k)?.label ?? k;
  const grupos: GrupoPorModulo[] = [];
  for (const area of areas) {
    if (AREAS_FORA_DA_META.has(area.id)) continue;
    const linhas: LinhaPorModulo[] = [];
    for (const col of area.colunas) {
      for (const key of col.keys) {
        const m = porKey.get(key);
        if (!m || MODULOS_FORA_DA_META.has(key)) continue;
        const ind = INDICADORES[key] ?? null;
        if (m.parent && !ind) continue; // parte interna sem indicador: fica no pai
        if (linhas.some((l) => l.key === key)) continue;
        linhas.push({
          key, label: m.label, area: area.titulo, indicador: ind,
          valor: ind && ind.entity ? valores[ind.entity] ?? 0 : null,
          compartilhadoCom: (ind?.compartilhadoCom ?? []).map(rotulo),
        });
      }
    }
    if (linhas.length > 0) grupos.push({ area: area.titulo, linhas });
  }
  return grupos;
}

/** Totais para o cabeçalho da aba. */
export function resumirPorModulo(grupos: GrupoPorModulo[]) {
  const linhas = grupos.flatMap((g) => g.linhas);
  const comIndicador = linhas.filter((l) => l.indicador);
  const ligados = comIndicador.filter((l) => l.indicador?.tipo === 'POR_ITEM' || (l.valor ?? 0) > 0);
  return { modulos: linhas.length, comIndicador: comIndicador.length, ligados: ligados.length, semIndicador: linhas.length - comIndicador.length };
}
