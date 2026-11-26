import type { VagaDTO } from '@/lib/vagas/tipos';
import { curriculosDoGerente } from '@/lib/vagas/curriculo-situacao';

/**
 * ACOMPANHAMENTO DA VAGA (v1.227.0) — PURO. As 11 etapas do caminho, onde a
 * vaga está, o que se espera de quem, os alertas e a ordem da lista. Tudo
 * derivado da vaga na hora de ler: nada disso é gravado.
 */

export interface Etapa { n: number; chave: string; nome: string; quem: string; oQue: string }
export const ETAPAS: Etapa[] = [
  { n: 1, chave: 'SOLICITADA', nome: 'Solicitada', quem: 'Gerente', oQue: 'Pede a vaga, uma linha por pessoa, com currículos se tiver.' },
  { n: 2, chave: 'APROVACAO', nome: 'Aprovação do supervisor', quem: 'Supervisor', oQue: 'Aprova ou devolve para ajuste — prazo de 1 dia útil.' },
  { n: 3, chave: 'ENTREGA_RH', nome: 'Entrega ao RH', quem: 'SGO', oQue: 'Aprovada, a vaga vai sozinha para o sistema do RH.' },
  { n: 4, chave: 'RH_RECEBEU', nome: 'RH recebeu', quem: 'RH', oQue: 'Confirma o recebimento da solicitação.' },
  { n: 5, chave: 'VAGA_NUMERADA', nome: 'Vaga numerada', quem: 'RH', oQue: 'Dá o número da vaga no RH.' },
  { n: 6, chave: 'SELECAO', nome: 'Seleção (CapacitaRH)', quem: 'RH', oQue: 'Divulgação, triagem e indicações.' },
  { n: 7, chave: 'CONSULTA', nome: 'Consulta cadastral', quem: 'RH', oQue: 'Consulta cadastral do candidato.' },
  { n: 8, chave: 'ENTREVISTA', nome: 'Entrevista técnica', quem: 'Gerente + RH', oQue: 'O RH agenda e o gerente entrevista o candidato.' },
  { n: 9, chave: 'CANDIDATO_APROVADO', nome: 'Candidato aprovado', quem: 'Gerente + RH', oQue: 'Candidato aprovado na entrevista (reprovado volta à seleção).' },
  { n: 10, chave: 'ADMISSAO', nome: 'Admissão', quem: 'Gerente + DP', oQue: 'Documentos, exame e cadastro.' },
  { n: 11, chave: 'CONCLUIDA', nome: 'Contratação concluída', quem: 'RH', oQue: 'A pessoa começou; a solicitação é fechada.' },
];

/** As situações que o RH manda (rota 2), e em que etapa cada uma deixa a vaga. */
export const SITUACOES_DA_VAGA_NO_RH = ['recebida', 'vaga_numerada', 'em_selecao', 'consulta_cadastral', 'entrevista_agendada', 'candidato_aprovado', 'candidato_reprovado', 'em_admissao', 'concluida', 'cancelada'] as const;
export type SituacaoDaVagaNoRh = (typeof SITUACOES_DA_VAGA_NO_RH)[number];

const ETAPA_DO_RH: Record<string, { atual: number; aguardando: [string, string] }> = {
  recebida: { atual: 5, aguardando: ['RH', 'numerar a vaga.'] },
  vaga_numerada: { atual: 6, aguardando: ['RH', 'divulgar e fazer a triagem dos candidatos.'] },
  em_selecao: { atual: 6, aguardando: ['RH', 'indicar candidatos da seleção.'] },
  consulta_cadastral: { atual: 7, aguardando: ['RH', 'concluir a consulta cadastral do candidato.'] },
  entrevista_agendada: { atual: 8, aguardando: ['Gerente', 'fazer a entrevista técnica com o candidato.'] },
  candidato_reprovado: { atual: 6, aguardando: ['RH', 'indicar outro candidato (se tiver outro currículo, anexe na vaga).'] },
  candidato_aprovado: { atual: 10, aguardando: ['Gerente + DP', 'cuidar da admissão: documentos, exame e cadastro.'] },
  em_admissao: { atual: 10, aguardando: ['Gerente + DP', 'concluir a admissão.'] },
};

const DIA = 86_400_000;
const d = (iso: string | null | undefined) => (iso ? new Date(iso) : null);
/** O dia civil de Brasília (AAAA-MM-DD). */
export const diaBR = (data: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);

/** "30 min", "3 h", "5 dias" — quanto tempo entre dois instantes. */
export function duracao(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const dias = Math.round(h / 24);
  return `${dias} dia${dias === 1 ? '' : 's'}`;
}
export const diasEntre = (de: Date, ate: Date) => Math.floor((ate.getTime() - de.getTime()) / DIA);

/**
 * O prazo de 1 dia útil: a mesma hora do próximo dia útil (sábado e domingo
 * não contam). Pedido na sexta às 15h vence na segunda às 15h.
 */
export function prazoDeUmDiaUtil(desde: Date): Date {
  const p = new Date(desde.getTime() + DIA);
  const dow = () => new Date(`${diaBR(p)}T12:00:00Z`).getUTCDay();
  while (dow() === 0 || dow() === 6) p.setTime(p.getTime() + DIA);
  return p;
}
export const foraDoPrazo = (desde: Date, agora: Date) => agora.getTime() > prazoDeUmDiaUtil(desde).getTime();

export type EstadoDaPosicao = 'normal' | 'devolvida' | 'nao-chegou' | 'cancelada' | 'concluida';
export interface Posicao {
  /** 1..11: a etapa em que a vaga está AGORA (as anteriores estão feitas). */
  etapa: number;
  nome: string;
  estado: EstadoDaPosicao;
  desde: string;
  aguardando: { quem: string; oQue: string } | null;
}

/** O instante do último passo do RH (ou da entrega, se o RH ainda não respondeu). */
export function ultimoMovimentoNoRh(v: VagaDTO): string | null {
  return v.rhSituacaoEm ?? v.rhChegouEm ?? null;
}

export function posicaoDaVaga(v: VagaDTO): Posicao {
  const e = (n: number) => ETAPAS[n - 1].nome;
  if (v.status === 'CONCLUIDA') return { etapa: 11, nome: e(11), estado: 'concluida', desde: v.rhSituacaoEm ?? v.decididoEm ?? v.createdAt, aguardando: null };
  if (v.status === 'PENDENTE_APROVACAO') return { etapa: 2, nome: e(2), estado: 'normal', desde: v.enviadoParaAprovacaoEm, aguardando: { quem: 'Supervisor', oQue: 'aprovar ou devolver a solicitação.' } };
  if (v.status === 'DEVOLVIDA') return { etapa: 2, nome: e(2), estado: 'devolvida', desde: v.decididoEm ?? v.enviadoParaAprovacaoEm, aguardando: { quem: 'Gerente', oQue: 'corrigir e reenviar ao supervisor.' } };

  /* Aprovada (ou cancelada: para onde estava). */
  let etapa = 3;
  let desde = v.decididoEm ?? v.enviadoParaAprovacaoEm;
  let aguardando: Posicao['aguardando'] = { quem: 'SGO', oQue: 'entregar a vaga ao RH (envio automático).' };
  let estado: EstadoDaPosicao = 'normal';
  if (!v.decididoEm && v.status === 'CANCELADA') { etapa = 2; aguardando = null; }
  else if (!v.rhChegouEm) {
    if (v.rhEnvioSituacao === 'ERRO') { estado = 'nao-chegou'; aguardando = { quem: 'Supervisor', oQue: 'ver o motivo e reenviar ao RH.' }; }
  } else {
    const r = v.rhSituacao ? ETAPA_DO_RH[v.rhSituacao] : null;
    if (r) { etapa = r.atual; desde = v.rhSituacaoEm ?? v.rhChegouEm; aguardando = { quem: r.aguardando[0], oQue: r.aguardando[1] }; }
    else { etapa = 4; desde = v.rhChegouEm; aguardando = { quem: 'RH', oQue: 'confirmar o recebimento e numerar a vaga.' }; }
  }
  if (v.status === 'CANCELADA') return { etapa, nome: e(etapa), estado: 'cancelada', desde: v.canceladoEm ?? desde, aguardando: null };
  return { etapa, nome: e(etapa), estado, desde, aguardando };
}

/* ───────────────────────── alertas ───────────────────────── */

export type Nivel = 'ambar' | 'vermelho';
export interface Alerta { nivel: Nivel; chave: string; texto: string }

export const LIMITES = { rhAmbar: 3, rhVermelho: 7, inicioAmbar: 5, devolvidaAmbar: 2 };

export function alertasDaVaga(v: VagaDTO, agora: Date): Alerta[] {
  if (v.status === 'CONCLUIDA' || v.status === 'CANCELADA') return [];
  const out: Alerta[] = [];
  const hoje = diaBR(agora);

  if (v.status === 'PENDENTE_APROVACAO' && foraDoPrazo(new Date(v.enviadoParaAprovacaoEm), agora)) {
    out.push({ nivel: 'vermelho', chave: 'PRAZO_DO_SUPERVISOR', texto: 'Fora do prazo de 1 dia útil para aprovar' });
  }
  if (v.status === 'DEVOLVIDA') {
    const desde = d(v.decididoEm);
    if (desde && diasEntre(desde, agora) >= LIMITES.devolvidaAmbar) out.push({ nivel: 'ambar', chave: 'DEVOLVIDA_PARADA', texto: `Devolvida há ${diasEntre(desde, agora)} dias sem correção` });
  }
  if (v.status === 'APROVADA') {
    if (!v.rhChegouEm && v.rhEnvioSituacao === 'ERRO') out.push({ nivel: 'vermelho', chave: 'NAO_CHEGOU', texto: 'Não chegou ao RH' });
    if (v.rhChegouEm && v.rhEnvioAcao === 'atualizar' && v.rhEnvioSituacao === 'ERRO') out.push({ nivel: 'ambar', chave: 'ALTERACAO_NAO_CHEGOU', texto: 'A alteração do supervisor não chegou ao RH' });
    const mov = d(ultimoMovimentoNoRh(v));
    if (mov) {
      const dias = diasEntre(mov, agora);
      if (dias >= LIMITES.rhVermelho) out.push({ nivel: 'vermelho', chave: 'RH_PARADO', texto: `Sem movimento do RH há ${dias} dias` });
      else if (dias >= LIMITES.rhAmbar) out.push({ nivel: 'ambar', chave: 'RH_PARADO', texto: `Sem movimento do RH há ${dias} dias` });
    }
    if (v.rhSituacao === 'candidato_reprovado') out.push({ nivel: 'ambar', chave: 'CANDIDATO_REPROVADO', texto: 'Candidato reprovado — a seleção recomeçou' });
  }
  if (v.inicioDesejado) {
    const falta = Math.round((new Date(`${v.inicioDesejado}T12:00:00Z`).getTime() - new Date(`${hoje}T12:00:00Z`).getTime()) / DIA);
    if (falta < 0) out.push({ nivel: 'vermelho', chave: 'INICIO_PASSOU', texto: 'O início desejado já passou' });
    else if (falta <= LIMITES.inicioAmbar) out.push({ nivel: 'ambar', chave: 'INICIO_PROXIMO', texto: falta === 0 ? 'O início desejado é hoje' : `Início desejado em ${falta} dia${falta === 1 ? '' : 's'}` });
  }
  return out;
}

export const piorNivel = (as: Alerta[]): Nivel | null => (as.some((a) => a.nivel === 'vermelho') ? 'vermelho' : as.length ? 'ambar' : null);

/* ───────────────────────── lista: filtros, cartões e ordem ───────────────────────── */

export type Filtro = 'aguardando' | 'devolvidas' | 'no-rh' | 'atencao' | 'curriculos' | 'sem-curriculo' | 'encerradas' | 'todas';
export const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'aguardando', label: 'Aguardando aprovação' },
  { value: 'devolvidas', label: 'Devolvidas' },
  { value: 'no-rh', label: 'No RH' },
  { value: 'atencao', label: 'Precisam de atenção' },
  { value: 'curriculos', label: 'Currículos para avaliar' },
  { value: 'sem-curriculo', label: 'Sem currículo (CapacitaRH)' },
  { value: 'encerradas', label: 'Concluídas / canceladas' },
  { value: 'todas', label: 'Todas' },
];

export const curriculosParaAvaliar = (v: VagaDTO) => v.curriculos.filter((c) => !c.removido && c.fluxo === 'AGUARDANDO_SUPERVISOR').length;
export const semCurriculo = (v: VagaDTO) => curriculosDoGerente(v.curriculos).length === 0;
const aberta = (v: VagaDTO) => v.status !== 'CONCLUIDA' && v.status !== 'CANCELADA';

export function passaNoFiltro(v: VagaDTO, f: Filtro, agora: Date): boolean {
  switch (f) {
    case 'aguardando': return v.status === 'PENDENTE_APROVACAO';
    case 'devolvidas': return v.status === 'DEVOLVIDA';
    case 'no-rh': return v.status === 'APROVADA';
    case 'atencao': return alertasDaVaga(v, agora).length > 0;
    case 'curriculos': return aberta(v) && curriculosParaAvaliar(v) > 0;
    case 'sem-curriculo': return aberta(v) && semCurriculo(v);
    case 'encerradas': return !aberta(v);
    default: return true;
  }
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca por código, número do RH, unidade, quem pediu, cargo e quem sai. */
export function casaComABusca(v: VagaDTO, q: string): boolean {
  const alvo = semAcento(q.trim());
  if (!alvo) return true;
  const texto = semAcento([v.codigo, v.codigoRh ?? '', v.unitName, v.createdByName, v.cargoResumo, ...v.posicoes.map((p) => `${p.cargo} ${p.substituiNome ?? ''}`)].join(' '));
  return alvo.split(/\s+/).every((t) => texto.includes(t));
}

/** O filtro em que a lista abre: para quem aprova, o que espera por ele. */
export function filtroPadrao(vagas: VagaDTO[], aprovador: boolean): Filtro {
  if (!aprovador) return 'todas';
  if (vagas.some((v) => v.status === 'PENDENTE_APROVACAO')) return 'aguardando';
  if (vagas.some((v) => aberta(v) && curriculosParaAvaliar(v) > 0)) return 'curriculos';
  return 'todas';
}

/**
 * A ordem: primeiro o que espera o supervisor (urgente e mais antiga primeiro);
 * depois vermelho, depois âmbar; por fim o início desejado mais próximo.
 */
export function ordenarVagas(vagas: VagaDTO[], agora: Date): VagaDTO[] {
  const peso = (v: VagaDTO) => {
    if (v.status === 'PENDENTE_APROVACAO') return 0;
    if (!aberta(v)) return 4;
    const n = piorNivel(alertasDaVaga(v, agora));
    return n === 'vermelho' ? 1 : n === 'ambar' ? 2 : 3;
  };
  return [...vagas].sort((a, b) => {
    const pa = peso(a), pb = peso(b);
    if (pa !== pb) return pa - pb;
    if (pa === 0) {
      const ua = a.prioridade === 'URGENTE' ? 0 : 1, ub = b.prioridade === 'URGENTE' ? 0 : 1;
      return ua - ub || a.enviadoParaAprovacaoEm.localeCompare(b.enviadoParaAprovacaoEm);
    }
    if (pa === 4) return b.createdAt.localeCompare(a.createdAt);
    return a.inicioDesejado.localeCompare(b.inicioDesejado) || a.createdAt.localeCompare(b.createdAt);
  });
}

export interface Cartoes {
  aguardando: number; aguardandoForaDoPrazo: number;
  devolvidas: number;
  noRh: number; semChegar: number; curriculosParaAvaliar: number;
  atencao: number; atrasadas: number;
  concluidas: number;
  porEtapa: { nome: string; n: number }[];
}

export function cartoesDaLista(vagas: VagaDTO[], agora: Date): Cartoes {
  const c: Cartoes = { aguardando: 0, aguardandoForaDoPrazo: 0, devolvidas: 0, noRh: 0, semChegar: 0, curriculosParaAvaliar: 0, atencao: 0, atrasadas: 0, concluidas: 0, porEtapa: [] };
  const etapas = new Map<number, number>();
  for (const v of vagas) {
    const as = alertasDaVaga(v, agora);
    if (v.status === 'PENDENTE_APROVACAO') { c.aguardando++; if (as.some((a) => a.chave === 'PRAZO_DO_SUPERVISOR')) c.aguardandoForaDoPrazo++; }
    if (v.status === 'DEVOLVIDA') c.devolvidas++;
    if (v.status === 'APROVADA') {
      c.noRh++;
      if (as.some((a) => a.chave === 'NAO_CHEGOU')) c.semChegar++;
      c.curriculosParaAvaliar += curriculosParaAvaliar(v);
      const p = posicaoDaVaga(v);
      etapas.set(p.etapa, (etapas.get(p.etapa) ?? 0) + 1);
    }
    if (v.status === 'CONCLUIDA') c.concluidas++;
    if (as.length > 0) { c.atencao++; if (piorNivel(as) === 'vermelho') c.atrasadas++; }
  }
  c.porEtapa = [...etapas.entries()].sort((a, b) => a[0] - b[0]).map(([n, q]) => ({ nome: ETAPAS[n - 1].nome, n: q }));
  return c;
}

/* ───────────────────────── o caminho (detalhe) ───────────────────────── */

export interface PassoDoCaminho extends Etapa { situacao: 'feita' | 'atual' | 'pendente' | 'parada'; quando: string | null; porQuem: string | null }

const TIPO_DA_ETAPA: Record<number, string[]> = {
  1: ['CRIADA'], 2: ['APROVADA'], 3: ['RH_ENTREGUE'], 4: ['RH_RECEBIDA'], 5: ['RH_VAGA_NUMERADA'],
  6: ['RH_EM_SELECAO'], 7: ['RH_CONSULTA_CADASTRAL'], 8: ['RH_ENTREVISTA_AGENDADA'], 9: ['RH_CANDIDATO_APROVADO'],
  10: ['RH_EM_ADMISSAO'], 11: ['RH_CONCLUIDA'],
};

export function caminhoDaVaga(v: VagaDTO): { passos: PassoDoCaminho[]; notas: string[] } {
  const pos = posicaoDaVaga(v);
  const passos = ETAPAS.map((e): PassoDoCaminho => {
    const ev = [...v.eventos].reverse().find((x) => TIPO_DA_ETAPA[e.n].includes(x.tipo));
    const feita = pos.estado === 'concluida' || e.n < pos.etapa;
    const atual = pos.estado !== 'concluida' && e.n === pos.etapa;
    return {
      ...e,
      situacao: feita ? 'feita' : atual ? (pos.estado === 'normal' ? 'atual' : 'parada') : 'pendente',
      quando: feita || atual ? ev?.createdAt ?? null : null,
      porQuem: feita ? ev?.usuarioNome ?? (ev?.origem === 'RH' ? 'RH' : null) : null,
    };
  });
  const notas: string[] = [];
  const devolucoes = v.eventos.filter((x) => x.tipo === 'DEVOLVIDA').length;
  if (devolucoes) notas.push(`Devolvida ${devolucoes}x para ajuste`);
  const reprovados = v.eventos.filter((x) => x.tipo === 'RH_CANDIDATO_REPROVADO').length;
  if (reprovados) notas.push(`${reprovados} candidato${reprovados === 1 ? '' : 's'} reprovado${reprovados === 1 ? '' : 's'} — a seleção recomeçou`);
  return { passos, notas };
}

/** O que cada evento significa e o que vem depois — a frase do histórico detalhado. */
export const EXPLICACAO_DO_EVENTO: Record<string, string> = {
  CRIADA: 'A solicitação foi enviada ao supervisor, que tem 1 dia útil para aprovar ou devolver.',
  REENVIADA: 'O gerente corrigiu o que o supervisor pediu e reenviou. O prazo de 1 dia útil recomeça.',
  APROVADA: 'O supervisor aprovou. O SGO envia a vaga ao RH sozinho.',
  DEVOLVIDA: 'O supervisor pediu ajuste. A vaga volta ao gerente para corrigir e reenviar.',
  CANCELADA: 'A solicitação foi cancelada e não segue adiante.',
  EXCLUIDA: 'A solicitação saiu das listas; o registro continua guardado.',
  EDITADA: 'O supervisor corrigiu a solicitação. A situação não muda.',
  LEMBRETE: 'O prazo de 1 dia útil passou e o supervisor foi lembrado.',
  CURRICULO_ANEXADO: 'Um currículo foi anexado à vaga.',
  CURRICULO_REMOVIDO: 'Um currículo foi retirado da vaga antes de ir ao RH.',
  CURRICULO_ENVIADO: 'O supervisor mandou o currículo novo ao RH.',
  CURRICULO_RECUSADO: 'O supervisor não enviou o currículo ao RH.',
  RH_ENTREGUE: 'O RH recebeu os dados. Agora ele confirma e numera a vaga.',
  RH_ERRO: 'O RH não aceitou o envio. O supervisor vê o motivo e pode reenviar.',
  RH_REENVIO: 'O envio ao RH foi colocado de novo na fila.',
  RH_RECEBIDA: 'O RH confirmou o recebimento. O próximo passo é numerar a vaga.',
  RH_VAGA_NUMERADA: 'A vaga ganhou número no RH. Começa a divulgação e a triagem.',
  RH_EM_SELECAO: 'O RH está selecionando candidatos (CapacitaRH).',
  RH_CONSULTA_CADASTRAL: 'O RH está fazendo a consulta cadastral do candidato.',
  RH_ENTREVISTA_AGENDADA: 'A entrevista técnica foi agendada. O gerente entrevista o candidato.',
  RH_CANDIDATO_APROVADO: 'O candidato foi aprovado. Agora é a admissão: documentos, exame e cadastro.',
  RH_CANDIDATO_REPROVADO: 'O candidato não seguiu. A seleção recomeça — se tiver outro currículo, anexe na vaga.',
  RH_EM_ADMISSAO: 'A admissão está em andamento.',
  RH_CONCLUIDA: 'A contratação foi concluída e a solicitação está fechada.',
  RH_CANCELADA: 'O RH cancelou a vaga.',
};
export const explicacaoDoEvento = (tipo: string) => EXPLICACAO_DO_EVENTO[tipo] ?? (tipo.startsWith('RH_CV_') ? 'O RH atualizou a situação de um currículo desta vaga.' : '');
