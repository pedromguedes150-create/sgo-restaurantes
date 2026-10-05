/**
 * ACOMPANHAMENTO OPERACIONAL — núcleo PURO (v1.155.0).
 *
 * Spec do Pedro (05/10/2026): a Rotina do Supervisor deixa de só medir USO do
 * SGO e passa a conferir a OPERAÇÃO na visita. Tudo o que decide algo mora
 * aqui, sem banco, para a tela, a rota e os testes perguntarem a mesma coisa.
 *
 * Regras que não se negociam:
 *  - ALERTA SÓ COM DADO REAL. Cada alerta vem de um número que o módulo já tem;
 *    `null` = o módulo não se aplica à unidade (não vira alerta nem "ok").
 *  - AUSÊNCIA NÃO É ZERO. "Não lançou" é alerta; nunca "0 kg de desperdício".
 *  - ADERÊNCIA AO SISTEMA ≠ ADERÊNCIA OPERACIONAL. Esta é só da visita; as
 *    metas não mudam.
 *  - DETERMINÍSTICO. Nada de IA decidindo conformidade.
 */

export type NivelAlerta = 'critico' | 'alto' | 'medio' | 'ok';
export type Gravidade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type Resposta = 'CONFORME' | 'NAO_CONFORME' | 'NAO_SE_APLICA';
export type Modo = 'SIMPLES' | 'AMOSTRAGEM' | 'TEMPERATURA';
export type TipoUnidade = 'RESTAURANTE' | 'LANCHONETE' | 'CD' | 'FABRICA';

export interface Alerta {
  chave: string;
  nivel: NivelAlerta;
  secao: string;
  titulo: string;
  detalhe?: string;
  /** De onde veio o número (módulo do SGO). */
  fonte: string;
  href?: string;
}

/**
 * Fatos da unidade que a pré-visita lê. `null` = o módulo não se aplica ou a
 * unidade nunca usou (não há o que cobrar — e não se inventa).
 */
export interface DadosPreVisita {
  desperdicio: { diasSemLancamento: number; janela: number; ultimoLancamento: string | null } | null;
  checklists: { naoRealizados: number; atrasados: number; realizados: number; janela: number; itensComFalha: { texto: string; vezes: number }[] } | null;
  ocorrencias: { abertasHaMaisDe3Dias: number; criticasAbertas: number; revisaoVencida: number } | null;
  validade: { vencidos: number; ate7Dias: number; tratativasPendentes: number } | null;
  comandas: { diasSemContagem: number; janela: number; divergenciasAbertas: number } | null;
  treinamentos: { atrasados: number; pendentes: number } | null;
  cofre: { retiradasProibidas: number; janela: number } | null;
  equipe: { ativos: number; semEscala: number; atestadosHoje: number; feriasHoje: number } | null;
  acoesAnteriores: { vencidas: number; abertas: number; aguardandoValidacao: number } | null;
}

/** Limiares dos alertas — nomeados para a regra ser lida, não adivinhada. */
export const LIMIARES = {
  desperdicioCritico: 2, // dias sem lançamento na janela
  checklistCritico: 3, // não realizados na janela
  comandasAlto: 2, // dias sem contagem
} as const;

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Os alertas do RESUMO PRÉ-VISITA, do mais grave ao "ok". */
export function montarAlertas(d: DadosPreVisita): Alerta[] {
  const a: Alerta[] = [];
  const push = (x: Alerta) => a.push(x);

  if (d.desperdicio) {
    const n = d.desperdicio.diasSemLancamento;
    if (n > 0) push({ chave: 'desperdicio-sem-lancamento', nivel: n >= LIMIARES.desperdicioCritico ? 'critico' : 'alto', secao: 'Desperdício', titulo: `Desperdício sem lançamento em ${plural(n, 'dia', 'dias')} (últimos ${d.desperdicio.janela})`, detalhe: d.desperdicio.ultimoLancamento ? `último lançamento em ${d.desperdicio.ultimoLancamento.split('-').reverse().join('/')}` : 'nenhum lançamento na janela', fonte: 'Desperdícios', href: '/modulos/desperdicios' });
    else push({ chave: 'desperdicio-ok', nivel: 'ok', secao: 'Desperdício', titulo: `Desperdício lançado todos os dias (últimos ${d.desperdicio.janela})`, fonte: 'Desperdícios' });
  }
  if (d.checklists) {
    const c = d.checklists;
    if (c.naoRealizados > 0) push({ chave: 'checklists-nao-realizados', nivel: c.naoRealizados >= LIMIARES.checklistCritico ? 'critico' : 'alto', secao: 'Checklists', titulo: `${plural(c.naoRealizados, 'checklist não realizado', 'checklists não realizados')} (últimos ${c.janela} dias)`, fonte: 'Tarefas', href: '/tarefas' });
    if (c.atrasados > 0) push({ chave: 'checklists-atrasados', nivel: 'medio', secao: 'Checklists', titulo: `${plural(c.atrasados, 'checklist feito fora do prazo', 'checklists feitos fora do prazo')}`, fonte: 'Tarefas' });
    for (const f of c.itensComFalha.slice(0, 3)) push({ chave: `checklist-item:${f.texto}`, nivel: 'medio', secao: 'Checklists', titulo: `Item com falha recorrente: "${f.texto}" (${f.vezes}×)`, fonte: 'Tarefas' });
    if (c.naoRealizados === 0 && c.atrasados === 0 && c.realizados > 0) push({ chave: 'checklists-ok', nivel: 'ok', secao: 'Checklists', titulo: `Checklists em dia (${c.realizados} realizados)`, fonte: 'Tarefas' });
  }
  if (d.ocorrencias) {
    const o = d.ocorrencias;
    if (o.criticasAbertas > 0) push({ chave: 'ocorrencias-criticas', nivel: 'critico', secao: 'Ocorrências', titulo: `${plural(o.criticasAbertas, 'ocorrência crítica aberta', 'ocorrências críticas abertas')}`, fonte: 'Ocorrências', href: '/modulos/ocorrencias' });
    if (o.abertasHaMaisDe3Dias > 0) push({ chave: 'ocorrencias-antigas', nivel: 'alto', secao: 'Ocorrências', titulo: `${plural(o.abertasHaMaisDe3Dias, 'ocorrência aberta', 'ocorrências abertas')} há mais de 3 dias`, fonte: 'Ocorrências', href: '/modulos/ocorrencias' });
    if (o.revisaoVencida > 0) push({ chave: 'ocorrencias-revisao', nivel: 'medio', secao: 'Ocorrências', titulo: `${plural(o.revisaoVencida, 'ocorrência', 'ocorrências')} com data de revisão vencida`, fonte: 'Ocorrências' });
  }
  if (d.validade) {
    const v = d.validade;
    if (v.vencidos > 0) push({ chave: 'validade-vencidos', nivel: 'critico', secao: 'Validade e armazenamento', titulo: `${plural(v.vencidos, 'lote vencido', 'lotes vencidos')} no estoque`, fonte: 'Estoque', href: '/modulos/estoque' });
    if (v.ate7Dias > 0) push({ chave: 'validade-proximos', nivel: 'alto', secao: 'Validade e armazenamento', titulo: `${plural(v.ate7Dias, 'lote vence', 'lotes vencem')} em até 7 dias`, fonte: 'Estoque', href: '/modulos/estoque' });
    if (v.tratativasPendentes > 0) push({ chave: 'validade-tratativas', nivel: 'medio', secao: 'Validade e armazenamento', titulo: `${plural(v.tratativasPendentes, 'tratativa de validade pendente', 'tratativas de validade pendentes')}`, fonte: 'Estoque' });
  }
  if (d.comandas) {
    const c = d.comandas;
    if (c.divergenciasAbertas > 0) push({ chave: 'comandas-divergencias', nivel: 'alto', secao: 'Comandas', titulo: `${plural(c.divergenciasAbertas, 'divergência de comanda em apuração', 'divergências de comanda em apuração')}`, fonte: 'Comandas', href: '/modulos/comandas' });
    if (c.diasSemContagem > 0) push({ chave: 'comandas-sem-contagem', nivel: c.diasSemContagem >= LIMIARES.comandasAlto ? 'alto' : 'medio', secao: 'Comandas', titulo: `Comandas sem conferência em ${plural(c.diasSemContagem, 'dia', 'dias')} (últimos ${c.janela})`, fonte: 'Comandas', href: '/modulos/comandas' });
  }
  if (d.treinamentos && d.treinamentos.atrasados > 0) push({ chave: 'treinamentos-atrasados', nivel: 'medio', secao: 'Treinamentos e POPs', titulo: `${plural(d.treinamentos.atrasados, 'treinamento atrasado', 'treinamentos atrasados')}`, detalhe: `${d.treinamentos.pendentes} pendente(s) no total`, fonte: 'Treinamentos', href: '/modulos/treinamentos' });
  if (d.cofre && d.cofre.retiradasProibidas > 0) push({ chave: 'cofre-retiradas', nivel: 'critico', secao: 'Cofre, troco e despesas', titulo: `${plural(d.cofre.retiradasProibidas, 'retirada do cofre para pagamento', 'retiradas do cofre para pagamento')} (últimos ${d.cofre.janela} dias)`, fonte: 'Gestão de Troco', href: '/modulos/troco' });
  if (d.equipe) {
    const e = d.equipe;
    if (e.semEscala > 0) push({ chave: 'equipe-sem-escala', nivel: 'medio', secao: 'Equipe e escala', titulo: `${plural(e.semEscala, 'colaborador ativo sem escala', 'colaboradores ativos sem escala')}`, fonte: 'Escala', href: '/modulos/pessoas' });
    if (e.atestadosHoje + e.feriasHoje > 0) push({ chave: 'equipe-ausencias', nivel: 'medio', secao: 'Equipe e escala', titulo: `Ausências hoje: ${plural(e.atestadosHoje, 'atestado', 'atestados')} e ${plural(e.feriasHoje, 'férias', 'férias')}`, detalhe: 'conferir cobertura das funções', fonte: 'Escala / Atestados' });
    if (e.semEscala === 0 && e.ativos > 0) push({ chave: 'equipe-ok', nivel: 'ok', secao: 'Equipe e escala', titulo: 'Escala cadastrada para toda a equipe ativa', fonte: 'Escala' });
  }
  if (d.acoesAnteriores) {
    const x = d.acoesAnteriores;
    if (x.vencidas > 0) push({ chave: 'acoes-vencidas', nivel: 'critico', secao: 'Pendências da visita anterior', titulo: `${plural(x.vencidas, 'ação vencida', 'ações vencidas')} do plano de ação`, fonte: 'Acompanhamento operacional' });
    if (x.aguardandoValidacao > 0) push({ chave: 'acoes-validar', nivel: 'alto', secao: 'Pendências da visita anterior', titulo: `${plural(x.aguardandoValidacao, 'ação a validar', 'ações a validar')} presencialmente`, detalhe: 'a unidade informou como resolvida', fonte: 'Acompanhamento operacional' });
  }
  const ordem: Record<NivelAlerta, number> = { critico: 0, alto: 1, medio: 2, ok: 3 };
  return a.sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
}

/* ───────────────────────────── roteiro ───────────────────────────── */

export interface ItemDoCatalogo {
  id: string; section: string; text: string; order: number;
  level: 'PRIMORDIAL' | 'COMPLEMENTAR'; mode: Modo;
  unitTypes: TipoUnidade[]; requiresPizzeria: boolean; active: boolean;
  photoOnNc: boolean; noteOnNc: boolean; tempMin: number | null; tempMax: number | null;
}

/** Item vale para a unidade? Sem tipos marcados = vale para todas. */
export function itemSeAplica(i: Pick<ItemDoCatalogo, 'active' | 'unitTypes' | 'requiresPizzeria'>, u: { operationType: TipoUnidade; hasPizzeria: boolean }): boolean {
  if (!i.active) return false;
  if (i.requiresPizzeria && !u.hasPizzeria) return false;
  return i.unitTypes.length === 0 || i.unitTypes.includes(u.operationType);
}

export interface ItemDoRoteiro {
  itemKey: string; itemId: string | null; section: string; text: string;
  level: 'PRIMORDIAL' | 'DIRECIONADA' | 'COMPLEMENTAR'; mode: Modo;
  tempMin: number | null; tempMax: number | null; photoOnNc: boolean; noteOnNc: boolean; order: number;
}

/**
 * Roteiro da visita em três níveis: A primordiais (aplicáveis à unidade), B
 * direcionadas (uma por alerta não-ok do resumo pré-visita) e C complementares.
 */
export function montarRoteiro(catalogo: ItemDoCatalogo[], unidade: { operationType: TipoUnidade; hasPizzeria: boolean }, alertas: Alerta[]): ItemDoRoteiro[] {
  const aplicaveis = catalogo.filter((i) => itemSeAplica(i, unidade)).sort((a, b) => a.order - b.order || a.text.localeCompare(b.text, 'pt-BR'));
  const doCatalogo = (i: ItemDoCatalogo, n: number): ItemDoRoteiro => ({
    itemKey: i.id, itemId: i.id, section: i.section, text: i.text, level: i.level, mode: i.mode,
    tempMin: i.tempMin, tempMax: i.tempMax, photoOnNc: i.photoOnNc, noteOnNc: i.noteOnNc, order: n,
  });
  const primordiais = aplicaveis.filter((i) => i.level === 'PRIMORDIAL').map((i, n) => doCatalogo(i, n));
  const direcionadas: ItemDoRoteiro[] = alertas.filter((x) => x.nivel !== 'ok').map((x, n) => ({
    itemKey: `dir:${x.chave}`, itemId: null, section: x.secao, text: `Conferir no local: ${x.titulo}`, level: 'DIRECIONADA', mode: 'SIMPLES',
    tempMin: null, tempMax: null, photoOnNc: false, noteOnNc: true, order: 1000 + n,
  }));
  const complementares = aplicaveis.filter((i) => i.level === 'COMPLEMENTAR').map((i, n) => doCatalogo(i, 2000 + n));
  return [...direcionadas, ...primordiais, ...complementares].map((r) => r);
}

/* ───────────────────────────── respostas ───────────────────────────── */

export interface EntradaDeResposta {
  mode: Modo; answer: Resposta | null; sampleChecked?: number | null; sampleOk?: number | null;
  temperature?: number | null; tempMin?: number | null; tempMax?: number | null;
}

/**
 * Resposta que vale. Amostragem: tudo conforme = CONFORME, senão NÃO CONFORME.
 * Temperatura COM faixa configurada: dentro = CONFORME, fora = NÃO CONFORME
 * (sem faixa, vale o que o supervisor marcou — o SGO não inventa limite).
 * "Não se aplica" marcado vence sempre.
 */
export function respostaDerivada(e: EntradaDeResposta): Resposta | null {
  if (e.answer === 'NAO_SE_APLICA') return 'NAO_SE_APLICA';
  if (e.mode === 'AMOSTRAGEM' && e.sampleChecked != null && e.sampleChecked > 0) {
    const ok = Math.max(0, Math.min(e.sampleOk ?? 0, e.sampleChecked));
    return ok === e.sampleChecked ? 'CONFORME' : 'NAO_CONFORME';
  }
  if (e.mode === 'TEMPERATURA' && e.temperature != null && (e.tempMin != null || e.tempMax != null)) {
    const t = e.temperature;
    const dentro = (e.tempMin == null || t >= e.tempMin) && (e.tempMax == null || t <= e.tempMax);
    return dentro ? 'CONFORME' : 'NAO_CONFORME';
  }
  return e.answer;
}

export interface RespostaParaConta {
  itemKey: string; itemId: string | null; section: string; level: string; mode: Modo;
  answer: Resposta | null; gravity: Gravidade | null; sampleChecked: number | null; sampleOk: number | null;
}

export interface Aderencia {
  total: number; respondidos: number; pendentes: number;
  conformes: number; naoConformes: number; naoAplicaveis: number; criticos: number;
  /** Pontos conferidos (amostragem conta cada unidade) e conformes. */
  pontosConferidos: number; pontosConformes: number;
  /** null = nada conferido ainda (ausência não é 0%). */
  pct: number | null;
}

/** Aderência operacional = pontos conformes ÷ pontos conferidos; N/A fora. */
export function aderencia(rs: RespostaParaConta[]): Aderencia {
  let conf = 0, nc = 0, na = 0, crit = 0, pc = 0, pok = 0, resp = 0;
  for (const r of rs) {
    if (!r.answer) continue;
    resp++;
    if (r.answer === 'NAO_SE_APLICA') { na++; continue; }
    if (r.answer === 'CONFORME') conf++; else nc++;
    if (r.answer === 'NAO_CONFORME' && r.gravity === 'CRITICA') crit++;
    if (r.mode === 'AMOSTRAGEM' && r.sampleChecked && r.sampleChecked > 0) {
      pc += r.sampleChecked; pok += Math.max(0, Math.min(r.sampleOk ?? 0, r.sampleChecked));
    } else { pc += 1; pok += r.answer === 'CONFORME' ? 1 : 0; }
  }
  return {
    total: rs.length, respondidos: resp, pendentes: rs.length - resp,
    conformes: conf, naoConformes: nc, naoAplicaveis: na, criticos: crit,
    pontosConferidos: pc, pontosConformes: pok, pct: pc ? Math.round((pok / pc) * 1000) / 10 : null,
  };
}

/** Seções com mais não conformidades (os "principais desvios"). */
export function principaisDesvios(rs: Pick<RespostaParaConta, 'section' | 'answer'>[], n = 5): { secao: string; qtd: number }[] {
  const m = new Map<string, number>();
  for (const r of rs) if (r.answer === 'NAO_CONFORME') m.set(r.section, (m.get(r.section) ?? 0) + 1);
  return [...m.entries()].map(([secao, qtd]) => ({ secao, qtd })).sort((a, b) => b.qtd - a.qtd || a.secao.localeCompare(b.secao, 'pt-BR')).slice(0, n);
}

/**
 * Reincidência: item do CATÁLOGO não conforme agora que já tinha sido apontado
 * não conforme numa visita anterior da mesma unidade. Direcionadas não contam
 * (o texto delas muda com o dado).
 */
export function reincidencias(atual: Pick<RespostaParaConta, 'itemId' | 'answer'>[], anteriores: Set<string>): string[] {
  return atual.filter((r) => r.answer === 'NAO_CONFORME' && r.itemId && anteriores.has(r.itemId)).map((r) => r.itemId as string);
}

/* ───────────────────────────── ações ───────────────────────────── */

export type SituacaoDaAcao = 'ABERTO' | 'EM_ANDAMENTO' | 'AGUARDANDO_VALIDACAO' | 'RESOLVIDO' | 'VENCIDO';

/** "Vencido" é derivado: prazo passado e ainda não resolvido. */
export function situacaoDaAcao(a: { status: string; dueDate: string | null }, hoje: string): SituacaoDaAcao {
  if (a.status === 'RESOLVIDO') return 'RESOLVIDO';
  if (a.dueDate && a.dueDate < hoje && a.status !== 'AGUARDANDO_VALIDACAO') return 'VENCIDO';
  return a.status as SituacaoDaAcao;
}

export const ROTULO_SITUACAO: Record<SituacaoDaAcao, string> = {
  ABERTO: 'Aberto', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_VALIDACAO: 'Aguardando validação', RESOLVIDO: 'Resolvido', VENCIDO: 'Vencido',
};

/** Gravidade da visita → gravidade da Ocorrência (quando o supervisor gera uma). */
export const GRAVIDADE_OCORRENCIA: Record<Gravidade, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = { BAIXA: 'LOW', MEDIA: 'MEDIUM', ALTA: 'HIGH', CRITICA: 'CRITICAL' };

export const SECOES_PRIMORDIAIS = [
  'Desperdício', 'Checklists', 'Validade e armazenamento', 'Higiene e segurança dos alimentos', 'Temperatura e conservação',
  'Estrutura física', 'Controle de pragas', 'Equipe e escala', 'Treinamentos e POPs', 'Comandas', 'Cofre, troco e despesas', 'Ocorrências',
] as const;

/** "85,7%" (pt-BR) — ou "—" quando não há o que medir (ausência não é 0%). */
export function pctBR(n: number | null | undefined): string {
  return n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
