/**
 * Escala de gerentes — a SEMANA da rede (v1.228.0).
 *
 * O relatório que a diretoria manda toda segunda-feira: de segunda a domingo,
 * quem folga em que dia, quem está de férias, que unidade fica sem gerente e
 * quem não tem folga lançada. Nenhuma regra nova — a situação de cada dia é a
 * MESMA `situacaoNoDia` da tela "Hoje na rede" (lançamento vence o padrão).
 *
 * Arquivo puro: só importa as regras puras. Tela e PDF leem o mesmo objeto.
 */

import { amanha, situacaoNoDia, type GerenteHoje, type SituacaoHoje } from '@/lib/manager-schedule-regras';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function somar(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A segunda-feira da semana (seg→dom) que contém o dia. */
export function segundaDe(iso: string): string {
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return somar(iso, wd === 0 ? -6 : 1 - wd);
}

/** Lê `?semana=` da URL: qualquer dia vira a segunda dele; inválido = semana de hoje. */
export function lerSemana(valor: unknown, hojeISO: string): string {
  return segundaDe(typeof valor === 'string' && ISO.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) ? valor : hojeISO);
}

export function diasDaSemana(segunda: string): string[] {
  const out = [segunda];
  for (let i = 1; i < 7; i++) out.push(amanha(out[i - 1]));
  return out;
}

export const semanaAnterior = (segunda: string) => somar(segunda, -7);
export const semanaSeguinte = (segunda: string) => somar(segunda, 7);

/**
 * Unidade de APOIO (Centro de Distribuição, Produtos/Fábrica): fica FORA do
 * relatório semanal da diretoria — "tratamos diferente" (Daniel, 26/11/2026).
 * Vale o tipo de operação do cadastro (CD ou FABRICA); o nome é a rede de
 * segurança para a unidade que ainda está com o tipo padrão.
 */
export function unidadeDeApoio(u: { name: string; operationType?: string | null }): boolean {
  if (u.operationType === 'CD' || u.operationType === 'FABRICA') return true;
  const n = u.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /centro de distribuicao|\(\s*produtos\s*\)|\bfabrica\b/.test(n);
}

const ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const curto = (iso: string) => `${ABREV[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "qui 26/11" · "seg 23/11 a qua 25/11" · "a semana toda" — dias seguidos viram um intervalo. */
export function textoDosDias(isos: string[]): string {
  if (isos.length === 0) return '';
  if (isos.length === 7) return 'a semana toda';
  const blocos: string[][] = [];
  for (const iso of [...isos].sort()) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && amanha(ultimo[ultimo.length - 1]) === iso) ultimo.push(iso); else blocos.push([iso]);
  }
  return blocos.map((b) => (b.length === 1 ? curto(b[0]) : b.length === 2 ? `${curto(b[0])} e ${curto(b[1])}` : `${curto(b[0])} a ${curto(b[b.length - 1])}`)).join(', ');
}

export interface LinhaExecutiva {
  unitId: string;
  unitName: string;
  gerentes: number;
  /** "Fulano — qui 26/11", um por gerente com folga. */
  folgas: { name: string; quando: string }[];
  ferias: { name: string; quando: string }[];
  semFolga: string[];
  /** '' = coberta a semana toda. */
  semGerente: string;
}

/** O quadro do relatório: UMA linha por unidade, em texto — sem grade e sem calendário. */
export function quadroExecutivo(s: SemanaDaRede): LinhaExecutiva[] {
  return s.unidades.map((u) => {
    const dos = (l: LinhaDaSemana, alvo: SituacaoHoje) => s.dias.filter((_, i) => l.dias[i] === alvo);
    return {
      unitId: u.unitId,
      unitName: u.unitName,
      gerentes: u.linhas.length,
      folgas: u.linhas.filter((l) => l.folgas > 0).map((l) => ({ name: l.name, quando: textoDosDias(dos(l, 'FOLGA')) })),
      ferias: u.linhas.filter((l) => l.ferias > 0).map((l) => ({ name: l.name, quando: textoDosDias(dos(l, 'FERIAS')) })),
      semFolga: u.linhas.filter((l) => l.semFolga).map((l) => l.name),
      semGerente: textoDosDias(u.diasSemGerente),
    };
  });
}

export const SIGLA_DA_SITUACAO: Record<SituacaoHoje, string> = {
  TRABALHA: 'T',
  FOLGA: 'F',
  FERIAS: 'FE',
  FORA_DO_PADRAO: '–',
  SEM_HORARIO: '?',
};

export interface LinhaDaSemana {
  userId: string;
  name: string;
  /** Uma situação por dia, de segunda a domingo. */
  dias: SituacaoHoje[];
  folgas: number;
  ferias: number;
  temHorario: boolean;
  /** Nenhuma folga nem férias LANÇADA na semana. */
  semFolga: boolean;
}

export interface UnidadeDaSemana {
  unitId: string;
  unitName: string;
  linhas: LinhaDaSemana[];
  /** Quantos gerentes trabalham em cada dia. */
  cobertura: number[];
  /** Dias em que nenhum gerente com horário trabalha (só conta se alguém tem horário). */
  diasSemGerente: string[];
  semHorario: boolean;
}

export interface FolgaDaSemana {
  iso: string;
  unitName: string;
  name: string;
  kind: 'FOLGA' | 'FERIAS';
  lancadoPor: string | null;
  note: string | null;
}

export interface ResumoDaSemana {
  unidades: number;
  gerentes: number;
  /** Pessoas com ao menos um dia de folga lançado. */
  comFolga: number;
  /** Pessoas sem folga nem férias lançada na semana. */
  semFolga: number;
  diasDeFolga: number;
  emFerias: number;
  unidadesComDiaDescoberto: number;
  diasDescobertos: number;
  semHorario: number;
}

export interface SemanaDaRede {
  de: string;
  ate: string;
  dias: string[];
  resumo: ResumoDaSemana;
  /** Pessoas fora (folga + férias) em cada dia, contadas uma vez. */
  foraPorDia: number[];
  /** Unidades sem gerente em cada dia. */
  descobertasPorDia: number[];
  unidades: UnidadeDaSemana[];
  folgas: FolgaDaSemana[];
  semFolga: { name: string; unidades: string[] }[];
  descobertos: { unitName: string; dias: string[] }[];
  leituras: string[];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function montarSemana(
  entrada: { unitId: string; unitName: string; gerentes: GerenteHoje[] }[],
  segunda: string,
): SemanaDaRede {
  const dias = diasDaSemana(segunda);
  const pessoas = new Map<string, { linha: LinhaDaSemana; unidades: string[] }>();
  const folgas: FolgaDaSemana[] = [];

  const unidades: UnidadeDaSemana[] = entrada.map((u) => {
    const linhas: LinhaDaSemana[] = u.gerentes.map((g) => {
      const porDia = dias.map((iso) => situacaoNoDia(g, iso));
      porDia.forEach((p, i) => {
        if (p.ausencia) folgas.push({ iso: dias[i], unitName: u.unitName, name: g.name, kind: p.ausencia.kind, lancadoPor: p.ausencia.lancadoPor, note: p.ausencia.note });
      });
      const sit = porDia.map((p) => p.situacao);
      const linha: LinhaDaSemana = {
        userId: g.userId,
        name: g.name,
        dias: sit,
        folgas: sit.filter((s) => s === 'FOLGA').length,
        ferias: sit.filter((s) => s === 'FERIAS').length,
        temHorario: g.weekdays.length > 0,
        semFolga: !sit.some((s) => s === 'FOLGA' || s === 'FERIAS'),
      };
      const p = pessoas.get(g.userId);
      if (p) p.unidades.push(u.unitName); else pessoas.set(g.userId, { linha, unidades: [u.unitName] });
      return linha;
    });
    const algumComHorario = linhas.some((l) => l.temHorario);
    const cobertura = dias.map((_, i) => linhas.filter((l) => l.dias[i] === 'TRABALHA').length);
    return {
      unitId: u.unitId,
      unitName: u.unitName,
      linhas,
      cobertura,
      diasSemGerente: algumComHorario ? dias.filter((_, i) => cobertura[i] === 0) : [],
      semHorario: linhas.length > 0 && !algumComHorario,
    };
  });

  const ps = [...pessoas.values()];
  const foraPorDia = dias.map((_, i) => ps.filter((p) => p.linha.dias[i] === 'FOLGA' || p.linha.dias[i] === 'FERIAS').length);
  const descobertasPorDia = dias.map((iso) => unidades.filter((u) => u.diasSemGerente.includes(iso)).length);
  const descobertos = unidades.filter((u) => u.diasSemGerente.length > 0).map((u) => ({ unitName: u.unitName, dias: u.diasSemGerente }));
  const semFolga = ps.filter((p) => p.linha.semFolga).map((p) => ({ name: p.linha.name, unidades: p.unidades }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const resumo: ResumoDaSemana = {
    unidades: unidades.length,
    gerentes: ps.length,
    comFolga: ps.filter((p) => p.linha.folgas > 0).length,
    semFolga: semFolga.length,
    diasDeFolga: ps.reduce((s, p) => s + p.linha.folgas, 0),
    emFerias: ps.filter((p) => p.linha.ferias > 0).length,
    unidadesComDiaDescoberto: descobertos.length,
    diasDescobertos: descobertos.reduce((s, d) => s + d.dias.length, 0),
    semHorario: ps.filter((p) => !p.linha.temHorario).length,
  };

  folgas.sort((a, b) => a.iso.localeCompare(b.iso) || a.unitName.localeCompare(b.unitName, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));

  return {
    de: dias[0], ate: dias[6], dias, resumo, foraPorDia, descobertasPorDia, unidades, folgas, semFolga, descobertos,
    leituras: leiturasDaSemana(resumo, dias, foraPorDia),
  };
}

const NOME_DO_DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const nomeDoDia = (iso: string) => NOME_DO_DIA[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** As frases do topo do relatório: só o que os números dizem. */
export function leiturasDaSemana(r: ResumoDaSemana, dias: string[], foraPorDia: number[]): string[] {
  const out: string[] = [];
  if (r.gerentes === 0) return ['Nenhum gerente vinculado às unidades do relatório.'];
  out.push(`${plural(r.comFolga, 'gerente tem', 'gerentes têm')} folga lançada na semana (${plural(r.diasDeFolga, 'dia', 'dias')} no total), de ${r.gerentes} na rede.`);
  if (r.emFerias > 0) out.push(`${plural(r.emFerias, 'gerente está', 'gerentes estão')} de férias em algum dia da semana.`);
  if (r.semFolga > 0) out.push(`${plural(r.semFolga, 'gerente está', 'gerentes estão')} sem folga nem férias lançada nesta semana.`);
  else out.push('Todos os gerentes têm folga ou férias lançada nesta semana.');
  const pico = Math.max(...foraPorDia);
  if (pico > 0) {
    const quais = dias.filter((_, i) => foraPorDia[i] === pico).map(nomeDoDia);
    out.push(`O dia com mais gerentes fora é ${quais.join(' e ')} (${pico}).`);
  }
  if (r.unidadesComDiaDescoberto > 0) out.push(`${plural(r.unidadesComDiaDescoberto, 'unidade fica', 'unidades ficam')} sem gerente em algum dia (${plural(r.diasDescobertos, 'dia descoberto', 'dias descobertos')}).`);
  else out.push('Nenhuma unidade fica sem gerente na semana.');
  if (r.semHorario > 0) out.push(`${plural(r.semHorario, 'gerente está', 'gerentes estão')} sem horário cadastrado e não ${r.semHorario === 1 ? 'conta' : 'contam'} como cobertura.`);
  return out;
}
