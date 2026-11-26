import type { CurriculoDTO, VagaDTO } from '@/lib/vagas/tipos';

/**
 * A SITUAÇÃO DE CADA CURRÍCULO (v1.227.0) — PURA. É o retorno ao gerente: o
 * selo ao lado do arquivo. Antes de o RH responder, o SGO mostra o que sabe;
 * depois, o status do RH (rota 3 do contrato).
 */

export type SituacaoDoRh =
  | 'recebido' | 'em_analise' | 'recrutamento_selecao' | 'entrevista_tecnica' | 'em_avaliacao_final'
  | 'aprovado' | 'reprovado' | 'banco_de_talentos' | 'desistencia' | 'contratado';

export const SITUACOES_DO_RH: { slug: SituacaoDoRh; rotulo: string; frase: string; tom: Tom; alta: boolean }[] = [
  { slug: 'recebido', rotulo: 'Recebido pelo RH', frase: 'O RH recebeu o currículo e ainda vai analisar.', tom: 'info', alta: false },
  { slug: 'em_analise', rotulo: 'Em análise', frase: 'O RH está analisando o currículo.', tom: 'info', alta: false },
  { slug: 'recrutamento_selecao', rotulo: 'Recrutamento / seleção', frase: 'O candidato entrou na seleção da CapacitaRH.', tom: 'info', alta: false },
  { slug: 'entrevista_tecnica', rotulo: 'Entrevista técnica', frase: 'O candidato vai para a entrevista técnica com você.', tom: 'brand', alta: true },
  { slug: 'em_avaliacao_final', rotulo: 'Em avaliação final', frase: 'A entrevista aconteceu; o RH está fechando a avaliação.', tom: 'info', alta: false },
  { slug: 'aprovado', rotulo: 'Aprovado', frase: 'O candidato foi aprovado e segue para a admissão.', tom: 'success', alta: true },
  { slug: 'reprovado', rotulo: 'Reprovado', frase: 'O candidato não seguiu. Se tiver outro currículo, anexe na vaga.', tom: 'danger', alta: true },
  { slug: 'banco_de_talentos', rotulo: 'Banco de talentos', frase: 'Não entrou nesta vaga; o RH guardou o currículo para outra oportunidade.', tom: 'neutral', alta: false },
  { slug: 'desistencia', rotulo: 'Desistência', frase: 'O candidato desistiu do processo.', tom: 'neutral', alta: false },
  { slug: 'contratado', rotulo: 'Contratado', frase: 'O candidato foi contratado.', tom: 'success', alta: true },
];
export type Tom = 'info' | 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

const POR_SLUG = new Map(SITUACOES_DO_RH.map((s) => [s.slug, s]));

const SINONIMOS: Record<string, SituacaoDoRh> = {
  recebida: 'recebido', recebido_pelo_rh: 'recebido', analise: 'em_analise', em_analise_rh: 'em_analise',
  recrutamento: 'recrutamento_selecao', selecao: 'recrutamento_selecao', recrutamento_e_selecao: 'recrutamento_selecao',
  entrevista: 'entrevista_tecnica', entrevista_agendada: 'entrevista_tecnica',
  avaliacao_final: 'em_avaliacao_final', aprovada: 'aprovado', reprovada: 'reprovado',
  banco_talentos: 'banco_de_talentos', banco: 'banco_de_talentos', desistiu: 'desistencia', desistente: 'desistencia',
  contratada: 'contratado', admitido: 'contratado',
};

/** "Recrutamento/Seleção", "Entrevista técnica", "DESISTIU" → o slug. Desconhecida = null. */
export function situacaoDoRh(bruto: unknown): SituacaoDoRh | null {
  const k = String(bruto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/[\s/\\-]+/g, '_').replace(/[^a-z_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (POR_SLUG.has(k as SituacaoDoRh)) return k as SituacaoDoRh;
  return SINONIMOS[k] ?? null;
}

export const LISTA_DAS_SITUACOES = SITUACOES_DO_RH.map((s) => s.slug).join(', ');
export const definicaoDaSituacao = (slug: string) => POR_SLUG.get(slug as SituacaoDoRh) ?? null;

/** Para o currículo enviado DEPOIS: o desfecho que o status do RH representa. */
export function desfechoDoFluxo(slug: SituacaoDoRh): 'APROVADO_RH' | 'REPROVADO_RH' | null {
  if (slug === 'aprovado' || slug === 'contratado') return 'APROVADO_RH';
  if (slug === 'reprovado' || slug === 'desistencia' || slug === 'banco_de_talentos') return 'REPROVADO_RH';
  return null;
}

export interface Selo { rotulo: string; frase: string; tom: Tom; quando: string | null; observacao: string | null }

/** O selo de UM currículo: o status do RH quando há; senão o que o SGO sabe do caminho dele. */
export function seloDoCurriculo(c: CurriculoDTO, vaga: Pick<VagaDTO, 'status' | 'rhChegouEm' | 'rhEnvioSituacao' | 'rhEnvioAcao'>): Selo {
  const base = { quando: null as string | null, observacao: null as string | null };
  if (c.fluxo === 'RECUSADO') return { rotulo: 'Recusado pelo supervisor', frase: c.motivoRecusa ? `Motivo: ${c.motivoRecusa}` : 'O supervisor não enviou este currículo ao RH.', tom: 'danger', quando: c.decididoEm, observacao: null };
  if (c.fluxo === 'AGUARDANDO_SUPERVISOR') return { ...base, rotulo: 'Aguardando o supervisor', frase: 'O supervisor precisa avaliar antes de enviar ao RH.', tom: 'warning' };
  const def = c.rhSituacao ? definicaoDaSituacao(c.rhSituacao) : null;
  if (def) return { rotulo: def.rotulo, frase: def.frase, tom: def.tom, quando: c.rhSituacaoEm, observacao: c.rhObservacao };
  if (c.fluxo === 'APROVADO_RH') return { rotulo: 'Aprovado', frase: 'O RH aprovou este candidato.', tom: 'success', quando: c.rhSituacaoEm, observacao: c.rhObservacao };
  if (c.fluxo === 'REPROVADO_RH') return { rotulo: 'Reprovado', frase: 'O RH não seguiu com este candidato.', tom: 'danger', quando: c.rhSituacaoEm, observacao: c.rhObservacao };
  if (c.fluxo === 'ENVIADO_RH') {
    if (c.rhEnvioSituacao === 'ENVIADO') return { ...base, rotulo: 'Entregue ao RH', frase: 'O RH recebeu o arquivo; aguardando a análise.', tom: 'info' };
    if (c.rhEnvioSituacao === 'ERRO') return { ...base, rotulo: 'Não chegou ao RH', frase: c.rhEnvioMotivo ?? 'O RH recusou o envio.', tom: 'danger' };
    return { ...base, rotulo: 'Indo para o RH', frase: 'Na fila de envio ao RH.', tom: 'neutral' };
  }
  /* Foi junto com a vaga. */
  if (vaga.status === 'PENDENTE_APROVACAO' || vaga.status === 'DEVOLVIDA') return { ...base, rotulo: 'Aguardando a aprovação da vaga', frase: 'Vai ao RH junto com a vaga, quando o supervisor aprovar.', tom: 'neutral' };
  if (vaga.rhChegouEm) return { ...base, rotulo: 'Entregue ao RH', frase: 'O RH recebeu o arquivo; aguardando a análise.', tom: 'info' };
  if (vaga.rhEnvioSituacao === 'ERRO') return { ...base, rotulo: 'Não chegou ao RH', frase: 'O envio da vaga ao RH foi recusado.', tom: 'danger' };
  return { ...base, rotulo: 'Indo para o RH', frase: 'Na fila de envio ao RH.', tom: 'neutral' };
}

/** "Currículos (6): 2 Em análise · 1 Reprovado · 3 Entregue ao RH" — na ordem em que aparecem. */
export function resumoDosCurriculos(curriculos: CurriculoDTO[], vaga: Pick<VagaDTO, 'status' | 'rhChegouEm' | 'rhEnvioSituacao' | 'rhEnvioAcao'>): { total: number; texto: string; porRotulo: { rotulo: string; n: number }[] } {
  const vivos = curriculos.filter((c) => !c.removido);
  const m = new Map<string, number>();
  for (const c of vivos) { const r = seloDoCurriculo(c, vaga).rotulo; m.set(r, (m.get(r) ?? 0) + 1); }
  const porRotulo = [...m.entries()].map(([rotulo, n]) => ({ rotulo, n }));
  return { total: vivos.length, porRotulo, texto: `Currículos (${vivos.length})${porRotulo.length ? `: ${porRotulo.map((x) => `${x.n} ${x.rotulo}`).join(' · ')}` : ''}` };
}

/** Currículos que contam como "o gerente mandou": vivos e não recusados pelo supervisor. */
export function curriculosDoGerente(curriculos: CurriculoDTO[]): CurriculoDTO[] {
  return curriculos.filter((c) => !c.removido && c.fluxo !== 'RECUSADO');
}
