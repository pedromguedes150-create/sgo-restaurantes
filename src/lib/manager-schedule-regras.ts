/**
 * REGRAS da Escala de gerentes que não dependem de banco (v1.170.0).
 *
 * Regra deste arquivo: nenhum import. Tela e servidor leem daqui, então a
 * folha do gerente e a recusa da rota dizem a mesma coisa.
 *
 * As três decisões do pedido (15/10/2026):
 *  1. o GERENTE lança a própria folga só para o FUTURO — "hoje é dia 15, ele
 *     não pode lançar datas passadas"; nem o dia de hoje, que já começou;
 *  2. apagar um lançamento EXIGE MOTIVO (para todos, inclusive Supervisão);
 *  3. o gerente só apaga o que ELE MESMO lançou e ainda não aconteceu — o que
 *     a Supervisão lançou para ele, e o que já passou, não é dele para apagar.
 */

/** Tamanho mínimo do motivo de exclusão: "erro" não explica nada. */
export const MOTIVO_MIN = 10;

export function motivoValido(m: unknown): m is string {
  return typeof m === 'string' && m.trim().length >= MOTIVO_MIN;
}

/** O dia seguinte a um ISO yyyy-mm-dd, em UTC puro (a data não tem hora). */
export function amanha(hojeISO: string): string {
  const d = new Date(`${hojeISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type RecusaPropria = 'DATA_PASSADA' | 'NAO_E_SEU' | 'INVALID';

/**
 * O gerente pode lançar a própria folga nesta data?
 * Só a partir de amanhã. O dia de hoje já tem operação em curso — folga de
 * hoje lançada às 14h é folga retroativa com outro nome.
 */
export function podeLancarPropria(hojeISO: string, startDate: string): RecusaPropria | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return 'INVALID';
  return startDate > hojeISO ? null : 'DATA_PASSADA';
}

/**
 * O gerente pode apagar ESTE lançamento?
 * Precisa ser dele, lançado por ele e ainda no futuro.
 */
export function podeApagarPropria(
  hojeISO: string,
  actorId: string,
  l: { userId: string; createdById: string | null; startDate: string },
): RecusaPropria | null {
  if (l.userId !== actorId || l.createdById !== actorId) return 'NAO_E_SEU';
  return l.startDate > hojeISO ? null : 'DATA_PASSADA';
}

/* ───────────── Hoje na rede (Admin/Coordenador) ───────────── */

export type SituacaoHoje = 'TRABALHA' | 'FOLGA' | 'FERIAS' | 'FORA_DO_PADRAO' | 'SEM_HORARIO';

export interface GerenteHoje {
  userId: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  /** Folgas/férias ATIVAS (não excluídas) que tocam a janela consultada. */
  ausencias: { kind: 'FOLGA' | 'FERIAS'; startDate: string; endDate: string; note: string | null; lancadoPor: string | null }[];
}

/** Mesma ordem de decisão da grade: lançamento vence o padrão semanal. */
export function situacaoNoDia(g: GerenteHoje, iso: string): { situacao: SituacaoHoje; ausencia: GerenteHoje['ausencias'][number] | null } {
  const a = g.ausencias.find((x) => x.startDate <= iso && x.endDate >= iso) ?? null;
  if (a) return { situacao: a.kind, ausencia: a };
  if (g.weekdays.length === 0) return { situacao: 'SEM_HORARIO', ausencia: null };
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return { situacao: g.weekdays.includes(wd) ? 'TRABALHA' : 'FORA_DO_PADRAO', ausencia: null };
}

export interface LinhaHoje {
  userId: string;
  name: string;
  situacao: SituacaoHoje;
  /** Período da ausência de hoje (quando há). */
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  lancadoPor: string | null;
  /** Volta amanhã? (último dia da ausência é hoje) */
  voltaAmanha: boolean;
}

export interface UnidadeHoje {
  unitId: string;
  unitName: string;
  linhas: LinhaHoje[];
  /** Quem está na unidade hoje (TRABALHA). */
  cobertura: string[];
  /** Nenhum gerente com horário trabalha hoje — e há ao menos um horário cadastrado. */
  semGerente: boolean;
  /** Ninguém tem horário: o SGO não sabe quem cobre. */
  semHorario: boolean;
}

export interface ResumoHoje {
  gerentes: number;
  trabalhando: number;
  deFolga: number;
  deFerias: number;
  unidadesSemGerente: number;
  voltamAmanha: number;
}

export function montarUnidadeHoje(unitId: string, unitName: string, gerentes: GerenteHoje[], hojeISO: string): UnidadeHoje {
  const linhas: LinhaHoje[] = gerentes.map((g) => {
    const { situacao, ausencia } = situacaoNoDia(g, hojeISO);
    return {
      userId: g.userId,
      name: g.name,
      situacao,
      startDate: ausencia?.startDate ?? null,
      endDate: ausencia?.endDate ?? null,
      note: ausencia?.note ?? null,
      lancadoPor: ausencia?.lancadoPor ?? null,
      voltaAmanha: Boolean(ausencia && ausencia.endDate === hojeISO),
    };
  });
  const algumComHorario = gerentes.some((g) => g.weekdays.length > 0);
  const cobertura = linhas.filter((l) => l.situacao === 'TRABALHA').map((l) => l.name);
  return {
    unitId, unitName, linhas, cobertura,
    semGerente: algumComHorario && cobertura.length === 0,
    semHorario: gerentes.length > 0 && !algumComHorario,
  };
}

export function resumirHoje(unidades: UnidadeHoje[]): ResumoHoje {
  /* Pessoa é contada UMA vez mesmo vinculada a duas unidades. */
  const vistos = new Map<string, LinhaHoje>();
  for (const u of unidades) for (const l of u.linhas) if (!vistos.has(l.userId)) vistos.set(l.userId, l);
  const ls = [...vistos.values()];
  return {
    gerentes: ls.length,
    trabalhando: ls.filter((l) => l.situacao === 'TRABALHA').length,
    deFolga: ls.filter((l) => l.situacao === 'FOLGA').length,
    deFerias: ls.filter((l) => l.situacao === 'FERIAS').length,
    unidadesSemGerente: unidades.filter((u) => u.semGerente).length,
    voltamAmanha: ls.filter((l) => l.voltaAmanha).length,
  };
}

/** Próximos N dias: quem estará fora, dia a dia (só lançamentos). */
export interface AusenciaProxima { iso: string; unitName: string; name: string; kind: 'FOLGA' | 'FERIAS' }
export function proximasAusencias(unidades: { unitName: string; gerentes: GerenteHoje[] }[], hojeISO: string, dias: number): AusenciaProxima[] {
  const out: AusenciaProxima[] = [];
  let iso = amanha(hojeISO);
  for (let i = 0; i < dias; i++) {
    for (const u of unidades) {
      for (const g of u.gerentes) {
        const a = g.ausencias.find((x) => x.startDate <= iso && x.endDate >= iso);
        if (a) out.push({ iso, unitName: u.unitName, name: g.name, kind: a.kind });
      }
    }
    iso = amanha(iso);
  }
  return out;
}

/* ───────────── Relatório da rede (Admin) ───────────── */

/** Dias de [startDate, endDate] que caem dentro de [de, ate]. */
export function diasDentro(startDate: string, endDate: string, de: string, ate: string): number {
  const a = startDate > de ? startDate : de;
  const b = endDate < ate ? endDate : ate;
  if (b < a) return 0;
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export const SITUACAO_ROTULO: Record<SituacaoHoje, string> = {
  TRABALHA: 'Na unidade',
  FOLGA: 'Folga',
  FERIAS: 'Férias',
  FORA_DO_PADRAO: 'Fora do padrão semanal',
  SEM_HORARIO: 'Sem horário cadastrado',
};
