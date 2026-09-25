import type { OrigemTreinamento } from './aplicabilidade';

/**
 * AGREGAÇÃO DO PAINEL DE TREINAMENTOS — pura, sem banco.
 *
 * Entra a lista de registros materializados pela reconciliação (um por
 * colaborador × MÓDULO × ciclo) e saem os números da rede, por unidade, por
 * POP, por módulo, por função e por colaborador. Nenhum número aqui olha para
 * "todos os POPs do sistema" nem para "todos os módulos do POP": a base é
 * sempre o que se aplica a cada pessoa.
 *
 * A REGRA FUNDAMENTAL (v1.124.0): o progresso de um colaborador num POP é
 *   módulos concluídos ÷ módulos APLICÁVEIS a ele.
 * João, Auxiliar de Cozinha, deve Desperdício e Manuseio (não Conferência):
 * concluiu Desperdício → 1 de 2 = 50%, nunca 1 de 3. O POP está CONCLUÍDO para
 * ele quando 100% dos módulos aplicáveis a ele estão feitos.
 *
 * Definições (as mesmas em toda tela, no PDF e no cartão):
 *   previstos  = concluídos + pendentes + atrasados   (o que a pessoa DEVE)
 *   concluídos = status DONE
 *   pendentes  = PENDING dentro do prazo
 *   atrasados  = MISSED, ou PENDING com prazo vencido que o scheduler ainda não
 *                marcou (o painel não espera a próxima rodada para dizer a verdade)
 *   taxa       = concluídos ÷ previstos (uma casa), null sem previstos
 *
 * CICLO VIGENTE: sem período informado, o painel mostra o ciclo em curso —
 * mensal = o mês atual; único = a versão atual do MÓDULO. Agosto concluído não
 * faz setembro concluído: cada mês é um registro, e o histórico fica na visão
 * do colaborador. Com período, entram os ciclos cujo PRAZO cai no intervalo.
 * Módulo inativado sai do vigente (o histórico fica).
 */

export type StatusTreino = 'PENDING' | 'DONE' | 'MISSED';
export type StatusFiltro = 'todos' | 'concluido' | 'pendente' | 'atrasado';

export interface LinhaTreinamento {
  recordId: string;
  popId: string;
  popTitle: string;
  moduleId: string;
  moduleName: string;
  moduleVersion: number;
  moduleCurrentVersion: number;
  moduleActive: boolean;
  recurrence: 'ONCE' | 'MONTHLY';
  collaboratorId: string;
  collaboratorName: string;
  jobTitle: string | null;
  unitId: string;
  unitName: string;
  origin: OrigemTreinamento;
  status: StatusTreino;
  periodKey: string;
  /** AAAA-MM-DD */
  dueDate: string;
  /** ISO completo ou null */
  completedAt: string | null;
}

export interface FiltrosPainel {
  unitId?: string;
  jobTitle?: string;
  collaboratorId?: string;
  popId?: string;
  moduleId?: string;
  status?: StatusFiltro;
  /** AAAA-MM-DD (inclusive) — quando informado, troca "ciclo vigente" por prazo no intervalo. */
  de?: string;
  ate?: string;
}

export interface Resumo {
  colaboradores: number;
  previstos: number;
  concluidos: number;
  pendentes: number;
  atrasados: number;
  taxa: number | null;
}

export interface LinhaUnidade extends Resumo { unitId: string; unitName: string }
export interface LinhaTreino extends Resumo { popId: string; popTitle: string; modulos: number }
export interface LinhaModulo extends Resumo { popId: string; popTitle: string; moduleId: string; moduleName: string }
export interface LinhaFuncao extends Resumo { jobTitle: string }
export interface LinhaColaborador extends Resumo {
  collaboratorId: string;
  name: string;
  jobTitle: string | null;
  unitId: string;
  unitName: string;
  itens: LinhaTreinamento[];
  /** Progresso por POP: só sobre os módulos aplicáveis a ESTA pessoa. */
  pops: ProgressoNoPop[];
}

/** "POP Operacional — 1 de 2 concluídos — 50%": a conta do colaborador num POP. */
export interface ProgressoNoPop {
  popId: string;
  popTitle: string;
  aplicaveis: number;
  concluidos: number;
  pendentes: number;
  atrasados: number;
  pct: number;
  /** 100% dos módulos aplicáveis feitos. */
  concluido: boolean;
  modulos: { moduleId: string; moduleName: string; status: StatusTreino; origin: OrigemTreinamento; completedAt: string | null; recordId: string }[];
}

export interface Painel {
  resumo: Resumo;
  /** POPs com ao menos uma atribuição no recorte. */
  popsAtivos: number;
  porUnidade: LinhaUnidade[];
  porTreinamento: LinhaTreino[];
  porModulo: LinhaModulo[];
  porFuncao: LinhaFuncao[];
  porColaborador: LinhaColaborador[];
  /** Todas as linhas filtradas, uma por atribuição (módulo) — a tabela detalhada. */
  detalhado: LinhaTreinamento[];
  /** Só o que ainda falta (pendente + atrasado), por unidade → colaborador. */
  pendencias: LinhaTreinamento[];
}

/** Estado que a tela mostra: prazo vencido conta como atrasado mesmo antes do scheduler marcar. */
export function statusEfetivo(l: LinhaTreinamento, hoje: string): StatusTreino {
  if (l.status === 'PENDING' && l.dueDate < hoje) return 'MISSED';
  return l.status;
}

export function cicloVigente(l: LinhaTreinamento, mesAtual: string): boolean {
  if (!l.moduleActive) return false;
  return l.recurrence === 'MONTHLY' ? l.periodKey === mesAtual : l.moduleVersion === l.moduleCurrentVersion;
}

const STATUS_DO_FILTRO: Record<Exclude<StatusFiltro, 'todos'>, StatusTreino> = {
  concluido: 'DONE',
  pendente: 'PENDING',
  atrasado: 'MISSED',
};

export function filtrarLinhas(linhas: LinhaTreinamento[], f: FiltrosPainel, mesAtual: string, hoje: string): LinhaTreinamento[] {
  const comPeriodo = Boolean(f.de || f.ate);
  const de = f.de ?? '0000-00-00';
  const ate = f.ate ?? '9999-12-31';
  const status = f.status && f.status !== 'todos' ? STATUS_DO_FILTRO[f.status] : null;
  return linhas.filter((l) => {
    if (comPeriodo ? l.dueDate < de || l.dueDate > ate : !cicloVigente(l, mesAtual)) return false;
    if (f.unitId && l.unitId !== f.unitId) return false;
    if (f.jobTitle && (l.jobTitle ?? '') !== f.jobTitle) return false;
    if (f.collaboratorId && l.collaboratorId !== f.collaboratorId) return false;
    if (f.popId && l.popId !== f.popId) return false;
    if (f.moduleId && l.moduleId !== f.moduleId) return false;
    if (status && statusEfetivo(l, hoje) !== status) return false;
    return true;
  });
}

function taxaDe(concluidos: number, previstos: number): number | null {
  return previstos === 0 ? null : Math.round((concluidos / previstos) * 1000) / 10;
}

export function resumoDe(linhas: LinhaTreinamento[], hoje: string): Resumo {
  let concluidos = 0;
  let pendentes = 0;
  let atrasados = 0;
  const pessoas = new Set<string>();
  for (const l of linhas) {
    pessoas.add(l.collaboratorId);
    const s = statusEfetivo(l, hoje);
    if (s === 'DONE') concluidos++;
    else if (s === 'PENDING') pendentes++;
    else atrasados++;
  }
  const previstos = linhas.length;
  return { colaboradores: pessoas.size, previstos, concluidos, pendentes, atrasados, taxa: taxaDe(concluidos, previstos) };
}

function agrupar<K extends string>(linhas: LinhaTreinamento[], chave: (l: LinhaTreinamento) => K): Map<K, LinhaTreinamento[]> {
  const m = new Map<K, LinhaTreinamento[]>();
  for (const l of linhas) {
    const k = chave(l);
    const arr = m.get(k) ?? [];
    arr.push(l);
    m.set(k, arr);
  }
  return m;
}

/** Quem precisa de atenção primeiro: menor taxa em cima; empate pelo nome. */
function porAtencao<T extends Resumo & { nome: string }>(a: T, b: T): number {
  const ta = a.taxa ?? 101;
  const tb = b.taxa ?? 101;
  if (ta !== tb) return ta - tb;
  return a.nome.localeCompare(b.nome, 'pt-BR');
}

export function porUnidadeDe(linhas: LinhaTreinamento[], hoje: string): LinhaUnidade[] {
  return [...agrupar(linhas, (l) => l.unitId).values()]
    .map((ls) => ({ unitId: ls[0].unitId, unitName: ls[0].unitName, nome: ls[0].unitName, ...resumoDe(ls, hoje) }))
    .sort(porAtencao)
    .map(({ nome: _n, ...r }) => r);
}

export function porTreinamentoDe(linhas: LinhaTreinamento[], hoje: string): LinhaTreino[] {
  return [...agrupar(linhas, (l) => l.popId).values()]
    .map((ls) => ({ popId: ls[0].popId, popTitle: ls[0].popTitle, nome: ls[0].popTitle, modulos: new Set(ls.map((l) => l.moduleId)).size, ...resumoDe(ls, hoje) }))
    .sort(porAtencao)
    .map(({ nome: _n, ...r }) => r);
}

/** POP → módulo: onde o supervisor vê "Desperdício 35 aplicáveis, 30 concluíram". */
export function porModuloDe(linhas: LinhaTreinamento[], hoje: string): LinhaModulo[] {
  return [...agrupar(linhas, (l) => l.moduleId).values()]
    .map((ls) => ({ popId: ls[0].popId, popTitle: ls[0].popTitle, moduleId: ls[0].moduleId, moduleName: ls[0].moduleName, nome: `${ls[0].popTitle} ${ls[0].moduleName}`, ...resumoDe(ls, hoje) }))
    .sort((a, b) => a.popTitle.localeCompare(b.popTitle, 'pt-BR') || porAtencao(a, b))
    .map(({ nome: _n, ...r }) => r);
}

export function porFuncaoDe(linhas: LinhaTreinamento[], hoje: string): LinhaFuncao[] {
  return [...agrupar(linhas, (l) => l.jobTitle ?? 'Sem função cadastrada').values()]
    .map((ls) => { const jobTitle = ls[0].jobTitle ?? 'Sem função cadastrada'; return { jobTitle, nome: jobTitle, ...resumoDe(ls, hoje) }; })
    .sort(porAtencao)
    .map(({ nome: _n, ...r }) => r);
}

/**
 * O progresso de UMA pessoa em cada POP — só sobre os módulos aplicáveis a
 * ela. É a conta "1 de 2 = 50%" do pedido, e a que diz se o POP está
 * concluído para ela (100% dos aplicáveis).
 */
export function progressoPorPop(itens: LinhaTreinamento[], hoje: string): ProgressoNoPop[] {
  return [...agrupar(itens, (l) => l.popId).values()]
    .map((ls) => {
      let concluidos = 0;
      let pendentes = 0;
      let atrasados = 0;
      const modulos = [...ls]
        .sort((a, b) => a.moduleName.localeCompare(b.moduleName, 'pt-BR'))
        .map((l) => {
          const s = statusEfetivo(l, hoje);
          if (s === 'DONE') concluidos++; else if (s === 'PENDING') pendentes++; else atrasados++;
          return { moduleId: l.moduleId, moduleName: l.moduleName, status: s, origin: l.origin, completedAt: l.completedAt, recordId: l.recordId };
        });
      const aplicaveis = ls.length;
      return {
        popId: ls[0].popId, popTitle: ls[0].popTitle,
        aplicaveis, concluidos, pendentes, atrasados,
        pct: aplicaveis === 0 ? 0 : Math.round((concluidos / aplicaveis) * 1000) / 10,
        concluido: aplicaveis > 0 && concluidos === aplicaveis,
        modulos,
      };
    })
    .sort((a, b) => a.popTitle.localeCompare(b.popTitle, 'pt-BR'));
}

export function porColaboradorDe(linhas: LinhaTreinamento[], hoje: string): LinhaColaborador[] {
  return [...agrupar(linhas, (l) => `${l.collaboratorId}|${l.unitId}`).values()]
    .map((ls) => ({
      collaboratorId: ls[0].collaboratorId,
      name: ls[0].collaboratorName,
      nome: ls[0].collaboratorName,
      jobTitle: ls[0].jobTitle,
      unitId: ls[0].unitId,
      unitName: ls[0].unitName,
      itens: [...ls].sort((a, b) => a.popTitle.localeCompare(b.popTitle, 'pt-BR') || a.moduleName.localeCompare(b.moduleName, 'pt-BR')),
      pops: progressoPorPop(ls, hoje),
      ...resumoDe(ls, hoje),
    }))
    .sort(porAtencao)
    .map(({ nome: _n, ...r }) => r);
}

export function pendenciasDe(linhas: LinhaTreinamento[], hoje: string): LinhaTreinamento[] {
  return linhas
    .filter((l) => statusEfetivo(l, hoje) !== 'DONE')
    .sort((a, b) =>
      a.unitName.localeCompare(b.unitName, 'pt-BR')
      || a.collaboratorName.localeCompare(b.collaboratorName, 'pt-BR')
      || a.popTitle.localeCompare(b.popTitle, 'pt-BR')
      || a.moduleName.localeCompare(b.moduleName, 'pt-BR'));
}

export function montarPainel(linhas: LinhaTreinamento[], f: FiltrosPainel, mesAtual: string, hoje: string): Painel {
  const filtradas = filtrarLinhas(linhas, f, mesAtual, hoje);
  const detalhado = [...filtradas].sort((a, b) =>
    a.unitName.localeCompare(b.unitName, 'pt-BR')
    || a.collaboratorName.localeCompare(b.collaboratorName, 'pt-BR')
    || a.popTitle.localeCompare(b.popTitle, 'pt-BR')
    || a.moduleName.localeCompare(b.moduleName, 'pt-BR'));
  return {
    resumo: resumoDe(filtradas, hoje),
    popsAtivos: new Set(filtradas.map((l) => l.popId)).size,
    porUnidade: porUnidadeDe(filtradas, hoje),
    porTreinamento: porTreinamentoDe(filtradas, hoje),
    porModulo: porModuloDe(filtradas, hoje),
    porFuncao: porFuncaoDe(filtradas, hoje),
    porColaborador: porColaboradorDe(filtradas, hoje),
    detalhado,
    pendencias: pendenciasDe(filtradas, hoje),
  };
}

export function emPercentual(taxa: number | null): string {
  return taxa === null ? '–' : `${taxa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function emData(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
