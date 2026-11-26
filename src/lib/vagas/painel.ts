import type { VagaDTO } from '@/lib/vagas/tipos';
import { ROTULO_DO_MOTIVO, type Motivo } from '@/lib/vagas/regras';
import { alertasDaVaga, diaBR, ETAPAS, piorNivel, posicaoDaVaga, prazoDeUmDiaUtil, semCurriculo } from '@/lib/vagas/acompanhamento';
import { resumoDosCurriculos } from '@/lib/vagas/curriculo-situacao';

/**
 * PAINEL DE VAGAS (v1.227.0) — PURO. Usa a MESMA lista da tela (já recortada
 * pelo alcance do usuário): o gerente vê a unidade dele; o supervisor, a rede.
 */

export type Periodo = 'mes' | '30' | '90' | 'tudo';
export const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'mes', label: 'Este mês' }, { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }, { value: 'tudo', label: 'Tudo' },
];
export const lerPeriodo = (v: unknown): Periodo => (v === '30' || v === '90' || v === 'tudo' ? v : 'mes');

/** O recorte pelo dia do PEDIDO (Brasília). */
export function noPeriodo(v: VagaDTO, periodo: Periodo, agora: Date): boolean {
  if (periodo === 'tudo') return true;
  const dia = diaBR(new Date(v.createdAt));
  if (periodo === 'mes') return dia.slice(0, 7) === diaBR(agora).slice(0, 7);
  const de = diaBR(new Date(agora.getTime() - Number(periodo) * 86_400_000));
  return dia >= de;
}

export interface Barra { rotulo: string; n: number; pct: number }
const barras = (m: Map<string, number>): Barra[] => {
  const total = [...m.values()].reduce((s, n) => s + n, 0);
  return [...m.entries()].map(([rotulo, n]) => ({ rotulo, n, pct: total ? (n / total) * 100 : 0 })).sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
};
const media = (xs: number[]) => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : null);
const HORA = 3_600_000, DIA = 86_400_000;

export interface LinhaDaUnidade { unitId: string; unidade: string; solicitacoes: number; pessoas: number; emAberto: number; atencao: number; concluidas: number; canceladas: number; semCurriculoPct: number; aprovacaoMediaH: number | null }

export interface Painel {
  solicitacoes: number; pessoas: number;
  emAberto: number; urgentes: number;
  atencao: number; atrasadas: number;
  comOSupervisor: number; devolvidas: number;
  noRh: number;
  concluidas: number; canceladas: number;
  /** Tempos: null = nada para medir ainda. */
  aprovacaoMediaH: number | null; aprovacaoNoPrazoPct: number | null;
  rhAteConcluirDias: number | null;
  pedidoAteContratacaoDias: number | null;
  origem: Barra[];
  quemTrouxeOAprovado: Barra[];
  porEtapa: Barra[];
  curriculosPorSituacao: Barra[];
  pessoasPorMotivo: Barra[];
  pessoasPorCargo: Barra[];
  porUnidade: LinhaDaUnidade[];
}

/** A primeira aprovação da vaga: quanto demorou e se foi dentro de 1 dia útil. */
function aprovacao(v: VagaDTO): { horas: number; noPrazo: boolean } | null {
  const pedido = v.eventos.find((e) => e.tipo === 'CRIADA')?.createdAt ?? v.createdAt;
  const aprovada = v.eventos.find((e) => e.tipo === 'APROVADA')?.createdAt;
  if (!aprovada) return null;
  const de = new Date(pedido), ate = new Date(aprovada);
  return { horas: Math.max(0, (ate.getTime() - de.getTime()) / HORA), noPrazo: ate.getTime() <= prazoDeUmDiaUtil(de).getTime() };
}

/** De onde veio o candidato aprovado: de um currículo do gerente ou da captação do RH. */
export function quemTrouxe(v: VagaDTO): 'Currículo do gerente' | 'CapacitaRH' | null {
  const teveAprovado = v.eventos.some((e) => e.tipo === 'RH_CANDIDATO_APROVADO') || v.status === 'CONCLUIDA';
  if (!teveAprovado) return null;
  const doGerente = v.curriculos.some((c) => !c.removido && (c.rhSituacao === 'aprovado' || c.rhSituacao === 'contratado' || c.fluxo === 'APROVADO_RH'));
  return doGerente ? 'Currículo do gerente' : 'CapacitaRH';
}

export function montarPainel(vagas: VagaDTO[], agora: Date): Painel {
  const aberta = (v: VagaDTO) => v.status !== 'CONCLUIDA' && v.status !== 'CANCELADA';
  const pessoas = (xs: VagaDTO[]) => xs.reduce((s, v) => s + v.quantidade, 0);
  const comAlerta = vagas.filter((v) => alertasDaVaga(v, agora).length > 0);

  const aps = vagas.map(aprovacao).filter((x): x is { horas: number; noPrazo: boolean } => x !== null);
  const concluidas = vagas.filter((v) => v.status === 'CONCLUIDA');
  const fim = (v: VagaDTO) => v.eventos.find((e) => e.tipo === 'RH_CONCLUIDA')?.createdAt ?? v.rhSituacaoEm;
  const rhDias = concluidas.map((v) => { const a = v.eventos.find((e) => e.tipo === 'APROVADA')?.createdAt, f = fim(v); return a && f ? (new Date(f).getTime() - new Date(a).getTime()) / DIA : null; }).filter((x): x is number => x !== null);
  const totalDias = concluidas.map((v) => { const f = fim(v); return f ? (new Date(f).getTime() - new Date(v.createdAt).getTime()) / DIA : null; }).filter((x): x is number => x !== null);

  const origem = new Map<string, number>([['Com currículo do gerente', 0], ['Sem currículo (CapacitaRH)', 0]]);
  const trouxe = new Map<string, number>();
  const etapas = new Map<string, number>();
  const cvs = new Map<string, number>();
  const motivos = new Map<string, number>();
  const cargos = new Map<string, number>();
  const unidades = new Map<string, { nome: string; xs: VagaDTO[] }>();
  for (const v of vagas) {
    origem.set(semCurriculo(v) ? 'Sem currículo (CapacitaRH)' : 'Com currículo do gerente', (origem.get(semCurriculo(v) ? 'Sem currículo (CapacitaRH)' : 'Com currículo do gerente') ?? 0) + 1);
    const q = quemTrouxe(v);
    if (q) trouxe.set(q, (trouxe.get(q) ?? 0) + 1);
    if (aberta(v)) { const nome = ETAPAS[posicaoDaVaga(v).etapa - 1].nome; etapas.set(nome, (etapas.get(nome) ?? 0) + 1); }
    for (const r of resumoDosCurriculos(v.curriculos, v).porRotulo) cvs.set(r.rotulo, (cvs.get(r.rotulo) ?? 0) + r.n);
    for (const p of v.posicoes) {
      const m = ROTULO_DO_MOTIVO[p.motivo as Motivo] ?? p.motivo;
      motivos.set(m, (motivos.get(m) ?? 0) + 1);
      cargos.set(p.cargo, (cargos.get(p.cargo) ?? 0) + 1);
    }
    const u = unidades.get(v.unitId) ?? { nome: v.unitName, xs: [] };
    u.xs.push(v);
    unidades.set(v.unitId, u);
  }
  if (vagas.length === 0) origem.clear();

  return {
    solicitacoes: vagas.length, pessoas: pessoas(vagas),
    emAberto: vagas.filter(aberta).length, urgentes: vagas.filter((v) => aberta(v) && v.prioridade === 'URGENTE').length,
    atencao: comAlerta.length, atrasadas: comAlerta.filter((v) => piorNivel(alertasDaVaga(v, agora)) === 'vermelho').length,
    comOSupervisor: vagas.filter((v) => v.status === 'PENDENTE_APROVACAO').length, devolvidas: vagas.filter((v) => v.status === 'DEVOLVIDA').length,
    noRh: vagas.filter((v) => v.status === 'APROVADA').length,
    concluidas: concluidas.length, canceladas: vagas.filter((v) => v.status === 'CANCELADA').length,
    aprovacaoMediaH: media(aps.map((a) => a.horas)),
    aprovacaoNoPrazoPct: aps.length ? (aps.filter((a) => a.noPrazo).length / aps.length) * 100 : null,
    rhAteConcluirDias: media(rhDias),
    pedidoAteContratacaoDias: media(totalDias),
    origem: barras(origem), quemTrouxeOAprovado: barras(trouxe),
    porEtapa: [...etapas.entries()].map(([rotulo, n]) => ({ rotulo, n, pct: 0 })).sort((a, b) => ETAPAS.findIndex((e) => e.nome === a.rotulo) - ETAPAS.findIndex((e) => e.nome === b.rotulo))
      .map((b, _i, xs) => ({ ...b, pct: (b.n / xs.reduce((s, x) => s + x.n, 0)) * 100 })),
    curriculosPorSituacao: barras(cvs), pessoasPorMotivo: barras(motivos), pessoasPorCargo: barras(cargos),
    porUnidade: [...unidades.entries()].map(([unitId, u]): LinhaDaUnidade => {
      const a = u.xs.map(aprovacao).filter((x): x is { horas: number; noPrazo: boolean } => x !== null);
      return {
        unitId, unidade: u.nome, solicitacoes: u.xs.length, pessoas: pessoas(u.xs),
        emAberto: u.xs.filter(aberta).length, atencao: u.xs.filter((v) => alertasDaVaga(v, agora).length > 0).length,
        concluidas: u.xs.filter((v) => v.status === 'CONCLUIDA').length, canceladas: u.xs.filter((v) => v.status === 'CANCELADA').length,
        semCurriculoPct: (u.xs.filter(semCurriculo).length / u.xs.length) * 100,
        aprovacaoMediaH: media(a.map((x) => x.horas)),
      };
    }).sort((a, b) => b.solicitacoes - a.solicitacoes || a.unidade.localeCompare(b.unidade, 'pt-BR')),
  };
}
