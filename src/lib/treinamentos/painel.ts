import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { montarPainel, type FiltrosPainel, type LinhaTreinamento, type Painel } from './agregacao';

/**
 * PAINEL DE ACOMPANHAMENTO — Supervisor/Admin/CEO veem a rede inteira.
 *
 * Lê os registros que a reconciliação materializou (um por colaborador × POP ×
 * ciclo) e entrega a `montarPainel`. Não há tabela nem cache paralelo: o
 * número da rede é a soma do que o quadro de cada unidade mostra.
 *
 * O painel NÃO reconcilia ao abrir (o quadro da unidade faz isso, e o
 * scheduler roda de hora em hora): reconciliar 15 unidades a cada abertura
 * custaria segundos. O que poderia ficar velho — pendência com prazo vencido
 * que o scheduler ainda não marcou — a agregação já trata como atrasado.
 */

export interface OpcoesDeFiltro {
  unidades: { id: string; name: string }[];
  funcoes: string[];
  treinamentos: { id: string; title: string }[];
  modulos: { id: string; popId: string; name: string; popTitle: string }[];
  colaboradores: { id: string; name: string; unitName: string }[];
}

export interface PainelTreinamentos {
  painel: Painel;
  opcoes: OpcoesDeFiltro;
  mesAtual: string;
  hoje: string;
  /** Todos os ciclos (inclusive passados) do colaborador filtrado — o histórico. */
  historicoDoColaborador: LinhaTreinamento[];
}

function ym(d: Date): string { return d.toISOString().slice(0, 7); }

export async function getPainelTreinamentos(user: SessionUser, filtros: FiltrosPainel): Promise<PainelTreinamentos> {
  const agora = new Date();
  const mesAtual = ym(agora);
  const hoje = agora.toISOString().slice(0, 10);
  const escopo = unitScopeWhere(user, 'unitId');

  const registros = await prisma.trainingRecord.findMany({
    where: { ...escopo, collaborator: { active: true }, unit: { active: true } },
    select: {
      id: true, popId: true, moduleId: true, moduleName: true, moduleVersion: true, collaboratorId: true, unitId: true,
      origin: true, status: true, periodKey: true, dueDate: true, completedAt: true,
      pop: { select: { title: true, recurrence: true } },
      module: { select: { version: true, active: true } },
      collaborator: { select: { name: true, jobTitle: true } },
      unit: { select: { name: true } },
    },
  });

  const linhas: LinhaTreinamento[] = registros.map((r) => ({
    recordId: r.id,
    popId: r.popId,
    popTitle: r.pop.title,
    moduleId: r.moduleId,
    moduleName: r.moduleName,
    moduleVersion: r.moduleVersion,
    moduleCurrentVersion: r.module.version,
    moduleActive: r.module.active,
    recurrence: r.pop.recurrence,
    collaboratorId: r.collaboratorId,
    collaboratorName: r.collaborator.name,
    jobTitle: r.collaborator.jobTitle,
    unitId: r.unitId,
    unitName: r.unit.name,
    origin: r.origin,
    status: r.status,
    periodKey: r.periodKey,
    dueDate: r.dueDate.toISOString().slice(0, 10),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  const painel = montarPainel(linhas, filtros, mesAtual, hoje);

  // Opções de filtro: o que existe no escopo (não só no recorte atual — senão a
  // pessoa não conseguiria trocar de unidade depois de filtrar uma).
  const unidadesMap = new Map<string, string>();
  const funcoesSet = new Set<string>();
  const treinosMap = new Map<string, string>();
  const modulosMap = new Map<string, { popId: string; name: string; popTitle: string }>();
  const colabsMap = new Map<string, { name: string; unitName: string }>();
  for (const l of linhas) {
    unidadesMap.set(l.unitId, l.unitName);
    if (l.jobTitle) funcoesSet.add(l.jobTitle);
    treinosMap.set(l.popId, l.popTitle);
    modulosMap.set(l.moduleId, { popId: l.popId, name: l.moduleName, popTitle: l.popTitle });
    if (!colabsMap.has(l.collaboratorId)) colabsMap.set(l.collaboratorId, { name: l.collaboratorName, unitName: l.unitName });
  }
  const opcoes: OpcoesDeFiltro = {
    unidades: [...unidadesMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    funcoes: [...funcoesSet].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    treinamentos: [...treinosMap].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    modulos: [...modulosMap].map(([id, m]) => ({ id, ...m })).sort((a, b) => a.popTitle.localeCompare(b.popTitle, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR')),
    colaboradores: [...colabsMap].map(([id, c]) => ({ id, ...c })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };

  const historicoDoColaborador = filtros.collaboratorId
    ? linhas
        .filter((l) => l.collaboratorId === filtros.collaboratorId)
        .sort((a, b) => (b.completedAt ?? b.dueDate).localeCompare(a.completedAt ?? a.dueDate) || a.popTitle.localeCompare(b.popTitle, 'pt-BR'))
    : [];

  return { painel, opcoes, mesAtual, hoje, historicoDoColaborador };
}

/** Lê os filtros da URL — só o que tem forma válida entra. */
export function filtrosDaUrl(sp: Record<string, string | undefined>): FiltrosPainel {
  const data = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const status = sp.status;
  return {
    unitId: sp.unit || undefined,
    jobTitle: sp.funcao || undefined,
    collaboratorId: sp.colab || undefined,
    popId: sp.pop || undefined,
    moduleId: sp.modulo || undefined,
    status: status === 'concluido' || status === 'pendente' || status === 'atrasado' ? status : 'todos',
    de: data(sp.start),
    ate: data(sp.end),
  };
}

/** Os mesmos filtros de volta para a URL (o PDF e os links de detalhe os carregam). */
export function urlDosFiltros(f: FiltrosPainel, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  if (f.unitId) p.set('unit', f.unitId);
  if (f.jobTitle) p.set('funcao', f.jobTitle);
  if (f.collaboratorId) p.set('colab', f.collaboratorId);
  if (f.popId) p.set('pop', f.popId);
  if (f.moduleId) p.set('modulo', f.moduleId);
  if (f.status && f.status !== 'todos') p.set('status', f.status);
  if (f.de) p.set('start', f.de);
  if (f.ate) p.set('end', f.ate);
  for (const [k, v] of Object.entries(extra)) { if (v) p.set(k, v); else p.delete(k); }
  const s = p.toString();
  return s ? `?${s}` : '';
}
