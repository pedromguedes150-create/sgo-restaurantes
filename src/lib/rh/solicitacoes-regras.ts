/**
 * SOLICITAÇÕES AO RH (v1.217.0) — as regras da tela, PURAS.
 *
 * A integração com o GBF-RH não muda: mesma tabela (`rh_demandas`), mesma fila,
 * mesmo endpoint e mesmo corpo (tipo, título, descrição, colaborador, data,
 * prioridade). O que este arquivo acrescenta é o que o SGO sabe a mais:
 *
 * - os CAMPOS de cada tipo (cargo, vagas, horário…), guardados no SGO e
 *   levados ao RH como texto organizado dentro da descrição — o contrato não
 *   tem campo para eles;
 * - a leitura da situação em FAIXAS (em andamento · aguardando minha resposta ·
 *   concluída · cancelada) para os indicadores e a ordenação;
 * - os números do painel de gestão.
 *
 * Nenhum import de servidor: a tela (cliente) e o servidor leem a MESMA regra.
 */

export type TipoDeSolicitacao =
  | 'ADMISSAO' | 'DESLIGAMENTO' | 'ATESTADO' | 'FERIAS' | 'MUDANCA_HORARIO'
  | 'MUDANCA_FUNCAO_SALARIO' | 'BENEFICIO' | 'DUVIDA' | 'OUTRO';
export type Prioridade = 'NORMAL' | 'ALTA' | 'URGENTE';
export type EnvioAoRh = 'NAO_ENVIADO' | 'AGUARDANDO' | 'ENVIADO' | 'COM_PROBLEMA';

export const ROTULO_DO_TIPO: Record<TipoDeSolicitacao, string> = {
  ADMISSAO: 'Admissão',
  DESLIGAMENTO: 'Desligamento',
  ATESTADO: 'Atestado',
  FERIAS: 'Férias',
  MUDANCA_HORARIO: 'Mudança de horário',
  MUDANCA_FUNCAO_SALARIO: 'Mudança de função / salário',
  BENEFICIO: 'Benefícios',
  DUVIDA: 'Dúvidas',
  OUTRO: 'Outros',
};
export const ROTULO_DA_PRIORIDADE: Record<Prioridade, string> = { NORMAL: 'Normal', ALTA: 'Alta', URGENTE: 'Urgente' };

/**
 * Os tipos que a tela OFERECE. "Atestado" fica de fora: atestado tem caminho
 * próprio (Central de Atestados, com leitura do documento, Escala e retorno do
 * RH); dois caminhos para a mesma coisa geram registro duplicado. O valor
 * segue no banco e nos rótulos por causa das solicitações antigas.
 */
export const TIPOS_OFERECIDOS: TipoDeSolicitacao[] = [
  'ADMISSAO', 'DESLIGAMENTO', 'FERIAS', 'MUDANCA_HORARIO', 'MUDANCA_FUNCAO_SALARIO', 'BENEFICIO', 'DUVIDA', 'OUTRO',
];

export type TipoDeCampo = 'texto' | 'numero' | 'data' | 'hora' | 'longo' | 'opcao';
export interface CampoDoTipo {
  key: string;
  label: string;
  tipo: TipoDeCampo;
  obrigatorio?: boolean;
  opcoes?: string[];
  placeholder?: string;
  /** Este campo é a "data do evento" que o contrato do RH aceita. */
  dataDoEvento?: boolean;
}
export interface DefinicaoDoTipo {
  /** 'sim' = obrigatório · 'opcional' · 'nao' = o campo nem aparece. */
  colaborador: 'sim' | 'opcional' | 'nao';
  campos: CampoDoTipo[];
  /** A descrição livre é obrigatória (tipos sem campo próprio que explique o pedido). */
  descricaoObrigatoria?: boolean;
  /** Orientação mostrada junto da descrição. */
  dica: string;
  /** Aviso mostrado ao escolher o tipo (ex.: existe um caminho próprio). */
  aviso?: string;
}

export const DEFINICAO_DO_TIPO: Record<TipoDeSolicitacao, DefinicaoDoTipo> = {
  ADMISSAO: {
    colaborador: 'nao',
    campos: [
      { key: 'cargo', label: 'Cargo', tipo: 'texto', obrigatorio: true, placeholder: 'ex.: Auxiliar de cozinha' },
      { key: 'vagas', label: 'Quantidade de vagas', tipo: 'numero', obrigatorio: true },
      { key: 'dataDesejada', label: 'Data desejada', tipo: 'data', dataDoEvento: true },
      { key: 'justificativa', label: 'Justificativa', tipo: 'longo', placeholder: 'ex.: reposição de quem saiu, aumento de movimento' },
    ],
    dica: 'Conte o horário de trabalho da vaga e o que mais ajudar na seleção.',
  },
  DESLIGAMENTO: {
    colaborador: 'sim',
    campos: [
      { key: 'dataPretendida', label: 'Data pretendida', tipo: 'data', dataDoEvento: true },
      { key: 'justificativa', label: 'Justificativa', tipo: 'longo', obrigatorio: true },
    ],
    dica: 'Explique o que motivou o pedido e o que já foi tentado.',
    aviso: 'O pedido formal de desligamento, com aprovação do supervisor, é feito em Pessoas → Desligamentos. Use esta solicitação para tratar o assunto com o RH antes disso.',
  },
  ATESTADO: {
    colaborador: 'sim',
    campos: [],
    dica: 'Atestados são lançados na Central de Atestados.',
    aviso: 'Atestados são lançados na Central de Atestados.',
  },
  FERIAS: {
    colaborador: 'sim',
    campos: [
      { key: 'inicio', label: 'Início', tipo: 'data', obrigatorio: true, dataDoEvento: true },
      { key: 'fim', label: 'Fim', tipo: 'data' },
      { key: 'observacoes', label: 'Observações', tipo: 'longo', placeholder: 'ex.: quer vender 10 dias' },
    ],
    dica: 'Se o período ainda não está fechado, informe o início pretendido e explique aqui.',
  },
  MUDANCA_HORARIO: {
    colaborador: 'sim',
    campos: [
      { key: 'horarioAtual', label: 'Horário atual', tipo: 'texto', placeholder: 'ex.: 07:00 às 15:20' },
      { key: 'horarioSolicitado', label: 'Horário solicitado', tipo: 'texto', obrigatorio: true, placeholder: 'ex.: 14:00 às 22:20' },
      { key: 'aPartirDe', label: 'A partir de', tipo: 'data', dataDoEvento: true },
    ],
    dica: 'Diga o motivo da mudança e se ela é definitiva ou por um período.',
  },
  MUDANCA_FUNCAO_SALARIO: {
    colaborador: 'sim',
    campos: [
      { key: 'tipoDeAlteracao', label: 'Tipo de alteração', tipo: 'opcao', obrigatorio: true, opcoes: ['Função', 'Salário', 'Função e salário'] },
      { key: 'situacaoAtual', label: 'Situação atual', tipo: 'texto', placeholder: 'ex.: Auxiliar de cozinha' },
      { key: 'proposta', label: 'Proposta', tipo: 'texto', obrigatorio: true, placeholder: 'ex.: Cozinheiro' },
      { key: 'justificativa', label: 'Justificativa', tipo: 'longo', obrigatorio: true },
      { key: 'aPartirDe', label: 'A partir de', tipo: 'data', dataDoEvento: true },
    ],
    dica: 'Acrescente o que sustentar o pedido: tempo na função, desempenho, quem ele substitui.',
  },
  BENEFICIO: {
    colaborador: 'opcional',
    campos: [
      { key: 'beneficio', label: 'Benefício', tipo: 'texto', obrigatorio: true, placeholder: 'ex.: vale-transporte, plano de saúde' },
    ],
    descricaoObrigatoria: true,
    dica: 'Descreva o que precisa ser feito: inclusão, alteração, cancelamento ou correção.',
  },
  DUVIDA: {
    colaborador: 'opcional',
    campos: [],
    descricaoObrigatoria: true,
    dica: 'Escreva a dúvida com o máximo de contexto. O resumo é o assunto.',
  },
  OUTRO: {
    colaborador: 'opcional',
    campos: [],
    descricaoObrigatoria: true,
    dica: 'Descreva o que você precisa do RH.',
  },
};

export const TITULO_MAX = 200;
export const DESCRICAO_MAX = 5000;
export const URGENCIA_MIN = 10;
export const ANEXOS_MAX = 5;
export const ANEXO_MAX_BYTES = 10 * 1024 * 1024;
/** v1.218.0 — o RH aceita no máximo 18 MB somados por envio. */
export const ANEXOS_TOTAL_BYTES = 18 * 1024 * 1024;

export type Detalhes = Record<string, string>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function dataBR(iso: string): string {
  if (!ISO.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Só as chaves do tipo, aparadas, sem vazios. O que não é do tipo é descartado. */
export function normalizarDetalhes(tipo: TipoDeSolicitacao, bruto: unknown): Detalhes {
  const out: Detalhes = {};
  if (!bruto || typeof bruto !== 'object') return out;
  for (const c of DEFINICAO_DO_TIPO[tipo].campos) {
    const v = (bruto as Record<string, unknown>)[c.key];
    const s = (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, c.tipo === 'longo' ? 1500 : 200);
    if (s) out[c.key] = s;
  }
  return out;
}

export interface DadosDaSolicitacao {
  tipo: TipoDeSolicitacao;
  titulo: string;
  descricao: string;
  prioridade: Prioridade;
  urgenciaMotivo: string;
  collaboratorId: string | null;
  detalhes: Detalhes;
}

/** A primeira coisa que falta, em palavras — ou `null` quando pode enviar. */
export function oQueFalta(d: DadosDaSolicitacao): string | null {
  const def = DEFINICAO_DO_TIPO[d.tipo];
  if (!def) return 'Escolha o tipo da solicitação.';
  if (d.tipo === 'ATESTADO') return 'Atestados são lançados na Central de Atestados.';
  if (def.colaborador === 'sim' && !d.collaboratorId) return 'Escolha o colaborador.';
  for (const c of def.campos) {
    const v = d.detalhes[c.key] ?? '';
    if (c.obrigatorio && !v) return `Preencha: ${c.label}.`;
    if (!v) continue;
    if (c.tipo === 'data' && !ISO.test(v)) return `${c.label}: data inválida.`;
    if (c.tipo === 'numero' && !(/^\d{1,3}$/.test(v) && Number(v) >= 1)) return `${c.label}: informe um número a partir de 1.`;
    if (c.tipo === 'opcao' && !(c.opcoes ?? []).includes(v)) return `${c.label}: escolha uma das opções.`;
  }
  if (d.detalhes.inicio && d.detalhes.fim && d.detalhes.fim < d.detalhes.inicio) return 'O fim não pode ser antes do início.';
  const titulo = d.titulo.trim();
  if (!titulo) return 'Escreva o resumo.';
  if (titulo.length > TITULO_MAX) return `O resumo passa de ${TITULO_MAX} caracteres.`;
  if (def.descricaoObrigatoria && !d.descricao.trim()) return 'Escreva a descrição.';
  if (d.descricao.trim().length > DESCRICAO_MAX) return `A descrição passa de ${DESCRICAO_MAX} caracteres.`;
  if (d.prioridade === 'URGENTE' && d.urgenciaMotivo.trim().length < URGENCIA_MIN) return 'Explique por que é urgente (pelo menos 10 caracteres).';
  return null;
}

/** O resumo sugerido a partir do que já foi preenchido. O gerente pode trocar. */
export function resumoSugerido(tipo: TipoDeSolicitacao, colaborador: string | null, detalhes: Detalhes): string {
  const nome = colaborador?.trim() || '';
  const de = nome ? ` — ${nome}` : '';
  let s = '';
  switch (tipo) {
    case 'ADMISSAO': {
      const n = Number(detalhes.vagas) || 0;
      s = detalhes.cargo ? `Admissão: ${n > 1 ? `${n} vagas de ` : ''}${detalhes.cargo}` : 'Admissão';
      break;
    }
    case 'DESLIGAMENTO': s = `Desligamento${de}`; break;
    case 'FERIAS':
      s = `Férias${de}${detalhes.inicio ? ` · ${dataBR(detalhes.inicio)}${detalhes.fim ? ` a ${dataBR(detalhes.fim)}` : ''}` : ''}`;
      break;
    case 'MUDANCA_HORARIO': s = `Mudança de horário${de}${detalhes.horarioSolicitado ? ` · ${detalhes.horarioSolicitado}` : ''}`; break;
    case 'MUDANCA_FUNCAO_SALARIO': s = `${detalhes.tipoDeAlteracao ? `Mudança de ${detalhes.tipoDeAlteracao.toLowerCase()}` : 'Mudança de função / salário'}${de}${detalhes.proposta ? ` · ${detalhes.proposta}` : ''}`; break;
    case 'BENEFICIO': s = `Benefício${detalhes.beneficio ? `: ${detalhes.beneficio}` : ''}${de}`; break;
    default: s = '';
  }
  return s.slice(0, TITULO_MAX);
}

/** A data que vai no campo `dataEvento` do contrato do RH. */
export function dataDoEvento(tipo: TipoDeSolicitacao, detalhes: Detalhes): string | null {
  const campo = DEFINICAO_DO_TIPO[tipo].campos.find((c) => c.dataDoEvento);
  const v = campo ? detalhes[campo.key] : '';
  return v && ISO.test(v) ? v : null;
}

/** Os campos preenchidos, com rótulo e valor legível — para a tela e para o RH. */
export function linhasDosDetalhes(tipo: TipoDeSolicitacao, detalhes: Detalhes | null | undefined): { label: string; valor: string }[] {
  if (!detalhes) return [];
  return DEFINICAO_DO_TIPO[tipo].campos
    .filter((c) => detalhes[c.key])
    .map((c) => ({ label: c.label, valor: c.tipo === 'data' ? dataBR(detalhes[c.key]) : detalhes[c.key] }));
}

/**
 * A descrição que o RH recebe: o texto do gerente e, abaixo, os campos do tipo.
 * Solicitação sem campo nenhum (as antigas) sai exatamente como foi escrita.
 */
export function descricaoParaORh(p: { tipo: TipoDeSolicitacao; descricao: string | null; detalhes: Detalhes | null; urgenciaMotivo: string | null; anexos: number }): string | null {
  const linhas = linhasDosDetalhes(p.tipo, p.detalhes).map((l) => `${l.label}: ${l.valor}`);
  if (p.urgenciaMotivo?.trim()) linhas.push(`Motivo da urgência: ${p.urgenciaMotivo.trim()}`);
  if (p.anexos > 0) linhas.push(`Anexos: ${p.anexos} arquivo(s)`);
  const texto = p.descricao?.trim() ?? '';
  if (linhas.length === 0) return texto || null;
  const bloco = `Dados da solicitação\n${linhas.join('\n')}`;
  return (texto ? `${texto}\n\n${bloco}` : bloco).slice(0, DESCRICAO_MAX);
}

/* ───────────────────────── situação em faixas ───────────────────────── */

export type Faixa = 'ANDAMENTO' | 'AGUARDANDO_RESPOSTA' | 'CONCLUIDA' | 'CANCELADA';
export const ROTULO_DA_FAIXA: Record<Faixa, string> = {
  ANDAMENTO: 'Em andamento',
  AGUARDANDO_RESPOSTA: 'Aguardando minha resposta',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/**
 * A situação em que o RH espera algo de quem pediu. O GBF-RH devolve (confirmado
 * em 19/11/2026): aberto · em_andamento · aguardando_terceiro ·
 * aguardando_solicitante · concluido · cancelado. `aguardando_terceiro` é o RH
 * esperando alguém de FORA (contabilidade, operadora) — não é pendência da
 * unidade e segue "em andamento".
 */
export const SITUACOES_QUE_PEDEM_RESPOSTA = ['aguardando_solicitante'];

export function faixaDaSituacao(rhSituacao: string | null | undefined): Faixa {
  const s = (rhSituacao ?? '').trim().toLowerCase();
  if (s === 'concluido') return 'CONCLUIDA';
  if (s === 'cancelado') return 'CANCELADA';
  if (SITUACOES_QUE_PEDEM_RESPOSTA.includes(s)) return 'AGUARDANDO_RESPOSTA';
  return 'ANDAMENTO';
}

export interface LinhaDaSolicitacao {
  id: string;
  tipo: TipoDeSolicitacao;
  titulo: string;
  prioridade: Prioridade;
  unitId: string;
  unitName: string;
  collaboratorName: string | null;
  createdById: string | null;
  createdByName: string;
  createdAt: string;
  rhNumero: string | null;
  rhPrazoAlvo: string | null;
  rhSituacao: string | null;
  rhSituacaoAt: string | null;
  situacaoRotulo: string;
  envio: EnvioAoRh;
  anexos: number;
}

/** A última vez que algo mudou: a situação do RH, ou a abertura. */
export function ultimaMovimentacao(l: Pick<LinhaDaSolicitacao, 'rhSituacaoAt' | 'createdAt'>): string {
  return l.rhSituacaoAt && l.rhSituacaoAt > l.createdAt ? l.rhSituacaoAt : l.createdAt;
}

export function aberta(l: Pick<LinhaDaSolicitacao, 'rhSituacao'>): boolean {
  const f = faixaDaSituacao(l.rhSituacao);
  return f === 'ANDAMENTO' || f === 'AGUARDANDO_RESPOSTA';
}

/** Prazo do RH vencido numa solicitação ainda aberta. `hoje` em AAAA-MM-DD. */
export function prazoVencido(l: Pick<LinhaDaSolicitacao, 'rhSituacao' | 'rhPrazoAlvo'>, hoje: string): boolean {
  return aberta(l) && Boolean(l.rhPrazoAlvo) && l.rhPrazoAlvo!.slice(0, 10) < hoje;
}

/** A pendência que pede ação de quem abriu — ou `null`. */
export function pendenciaDoSolicitante(l: Pick<LinhaDaSolicitacao, 'rhSituacao'>): string | null {
  return faixaDaSituacao(l.rhSituacao) === 'AGUARDANDO_RESPOSTA' ? 'O RH aguarda a sua resposta' : null;
}

export interface FiltroDaLista {
  faixa: Faixa | '';
  tipo: TipoDeSolicitacao | '';
  /** Dias para trás a partir de hoje; 0 = tudo. */
  dias: number;
  q: string;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrar(linhas: LinhaDaSolicitacao[], f: FiltroDaLista, agora: Date): LinhaDaSolicitacao[] {
  const corte = f.dias > 0 ? new Date(agora.getTime() - f.dias * 86_400_000).toISOString() : '';
  const q = semAcento(f.q.trim());
  return linhas.filter((l) => {
    if (f.faixa && faixaDaSituacao(l.rhSituacao) !== f.faixa) return false;
    if (f.tipo && l.tipo !== f.tipo) return false;
    if (corte && l.createdAt < corte) return false;
    if (q && !semAcento(`${l.titulo} ${l.rhNumero ?? ''} ${l.collaboratorName ?? ''} ${ROTULO_DO_TIPO[l.tipo]} ${l.unitName}`).includes(q)) return false;
    return true;
  });
}

/** Primeiro o que pede a atenção de quem abriu; depois, da mais recente para a mais antiga. */
export function ordenar(linhas: LinhaDaSolicitacao[]): LinhaDaSolicitacao[] {
  const peso = (l: LinhaDaSolicitacao) => (faixaDaSituacao(l.rhSituacao) === 'AGUARDANDO_RESPOSTA' ? 0 : 1);
  return [...linhas].sort((a, b) => peso(a) - peso(b) || ultimaMovimentacao(b).localeCompare(ultimaMovimentacao(a)));
}

export function indicadores(linhas: LinhaDaSolicitacao[]): Record<Faixa, number> {
  const out: Record<Faixa, number> = { ANDAMENTO: 0, AGUARDANDO_RESPOSTA: 0, CONCLUIDA: 0, CANCELADA: 0 };
  for (const l of linhas) out[faixaDaSituacao(l.rhSituacao)]++;
  return out;
}

/* ───────────────────────── painel de gestão ───────────────────────── */

/** Dias sem retorno do RH a partir dos quais a solicitação vira pendência. */
export const DIAS_SEM_RETORNO = 3;

export type TipoDePendencia = 'ENVIO_COM_PROBLEMA' | 'AGUARDANDO_RESPOSTA' | 'PRAZO_VENCIDO' | 'URGENTE_ABERTA' | 'SEM_RETORNO';
export const ROTULO_DA_PENDENCIA: Record<TipoDePendencia, string> = {
  ENVIO_COM_PROBLEMA: 'Envio ao RH com problema',
  AGUARDANDO_RESPOSTA: 'RH aguarda resposta da unidade',
  PRAZO_VENCIDO: 'Prazo do RH vencido',
  URGENTE_ABERTA: 'Urgente em aberto',
  SEM_RETORNO: `Sem retorno do RH há ${DIAS_SEM_RETORNO} dias ou mais`,
};
const ORDEM_DA_PENDENCIA: TipoDePendencia[] = ['ENVIO_COM_PROBLEMA', 'AGUARDANDO_RESPOSTA', 'PRAZO_VENCIDO', 'URGENTE_ABERTA', 'SEM_RETORNO'];

export interface Pendencia { tipo: TipoDePendencia; linha: LinhaDaSolicitacao; dias: number }

const diasEntre = (deIso: string, ate: Date) => Math.max(0, Math.floor((ate.getTime() - new Date(deIso).getTime()) / 86_400_000));

/** Uma pendência por solicitação: a mais grave que se aplica. */
export function pendencias(linhas: LinhaDaSolicitacao[], agora: Date, hoje: string): Pendencia[] {
  const out: Pendencia[] = [];
  for (const l of linhas) {
    if (!aberta(l)) continue;
    const dias = diasEntre(ultimaMovimentacao(l), agora);
    let tipo: TipoDePendencia | null = null;
    if (l.envio === 'COM_PROBLEMA') tipo = 'ENVIO_COM_PROBLEMA';
    else if (faixaDaSituacao(l.rhSituacao) === 'AGUARDANDO_RESPOSTA') tipo = 'AGUARDANDO_RESPOSTA';
    else if (prazoVencido(l, hoje)) tipo = 'PRAZO_VENCIDO';
    else if (l.prioridade === 'URGENTE') tipo = 'URGENTE_ABERTA';
    else if (dias >= DIAS_SEM_RETORNO) tipo = 'SEM_RETORNO';
    if (tipo) out.push({ tipo, linha: l, dias });
  }
  return out.sort((a, b) => ORDEM_DA_PENDENCIA.indexOf(a.tipo) - ORDEM_DA_PENDENCIA.indexOf(b.tipo) || b.dias - a.dias);
}

export interface PainelDeGestao {
  total: number;
  abertas: number;
  concluidas: number;
  canceladas: number;
  urgentesAbertas: number;
  /** Dias, em média, entre a abertura e a conclusão; nulo sem nenhuma concluída. */
  tempoMedioDias: number | null;
  /** Concluídas dentro do prazo do RH ÷ concluídas que tinham prazo; nulo sem base. */
  noPrazoPct: number | null;
  pendencias: Pendencia[];
  porTipo: { tipo: TipoDeSolicitacao; total: number; abertas: number }[];
  porUnidade: { unitId: string; unitName: string; total: number; abertas: number; concluidas: number; pendencias: number; tempoMedioDias: number | null }[];
  porSolicitante: { nome: string; total: number; abertas: number }[];
}

function media(xs: number[]): number | null {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
}
const diasAteConcluir = (l: LinhaDaSolicitacao) => (l.rhSituacaoAt ? Math.max(0, (new Date(l.rhSituacaoAt).getTime() - new Date(l.createdAt).getTime()) / 86_400_000) : null);

export function montarPainel(linhas: LinhaDaSolicitacao[], agora: Date, hoje: string): PainelDeGestao {
  const pend = pendencias(linhas, agora, hoje);
  const concl = linhas.filter((l) => faixaDaSituacao(l.rhSituacao) === 'CONCLUIDA');
  const comPrazo = concl.filter((l) => l.rhPrazoAlvo && l.rhSituacaoAt);
  const tempos = (xs: LinhaDaSolicitacao[]) => xs.map(diasAteConcluir).filter((d): d is number => d != null);

  const tipos = new Map<TipoDeSolicitacao, { total: number; abertas: number }>();
  const unidades = new Map<string, LinhaDaSolicitacao[]>();
  const pessoas = new Map<string, { total: number; abertas: number }>();
  for (const l of linhas) {
    const t = tipos.get(l.tipo) ?? { total: 0, abertas: 0 };
    t.total++; if (aberta(l)) t.abertas++;
    tipos.set(l.tipo, t);
    unidades.set(l.unitId, [...(unidades.get(l.unitId) ?? []), l]);
    const p = pessoas.get(l.createdByName) ?? { total: 0, abertas: 0 };
    p.total++; if (aberta(l)) p.abertas++;
    pessoas.set(l.createdByName, p);
  }

  return {
    total: linhas.length,
    abertas: linhas.filter(aberta).length,
    concluidas: concl.length,
    canceladas: linhas.filter((l) => faixaDaSituacao(l.rhSituacao) === 'CANCELADA').length,
    urgentesAbertas: linhas.filter((l) => l.prioridade === 'URGENTE' && aberta(l)).length,
    tempoMedioDias: media(tempos(concl)),
    noPrazoPct: comPrazo.length ? Math.round((comPrazo.filter((l) => l.rhSituacaoAt!.slice(0, 10) <= l.rhPrazoAlvo!.slice(0, 10)).length / comPrazo.length) * 100) : null,
    pendencias: pend,
    porTipo: [...tipos.entries()].map(([tipo, v]) => ({ tipo, ...v })).sort((a, b) => b.total - a.total),
    porUnidade: [...unidades.entries()].map(([unitId, xs]) => ({
      unitId, unitName: xs[0].unitName, total: xs.length, abertas: xs.filter(aberta).length,
      concluidas: xs.filter((l) => faixaDaSituacao(l.rhSituacao) === 'CONCLUIDA').length,
      pendencias: pend.filter((p) => p.linha.unitId === unitId).length,
      tempoMedioDias: media(tempos(xs.filter((l) => faixaDaSituacao(l.rhSituacao) === 'CONCLUIDA'))),
    })).sort((a, b) => b.pendencias - a.pendencias || b.abertas - a.abertas || a.unitName.localeCompare(b.unitName)),
    porSolicitante: [...pessoas.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.total - a.total).slice(0, 15),
  };
}
